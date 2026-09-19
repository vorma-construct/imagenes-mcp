/* Mezclas de audio: baja las voces, les pone la música por debajo y sirve el resultado.
   Las mezclas se definen en mezclas.json y se preparan al arrancar. */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

const DIR = path.join(process.cwd(), "salida");
fs.mkdirSync(DIR, { recursive: true });

async function bajar(url, destino) {
  if (url.startsWith("file://")) { fs.copyFileSync(url.slice(7), destino); return; }
  const r = await fetch(url);
  if (!r.ok) throw new Error("no se pudo bajar " + url + " (" + r.status + ")");
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

function ffmpeg(args) {
  return new Promise((ok, ko) => {
    const p = spawn(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", d => err += d);
    p.on("exit", c => c === 0 ? ok() : ko(new Error(err || "ffmpeg fallo " + c)));
  });
}

export async function prepararMezcla(m) {
  const tmp = path.join(DIR, "tmp-" + m.id);
  fs.mkdirSync(tmp, { recursive: true });
  const voces = [];
  for (let i = 0; i < m.voces.length; i++) {
    const f = path.join(tmp, "bajada" + i + (path.extname(new URL(m.voces[i]).pathname) || ".bin"));
    await bajar(m.voces[i], f);
    const wav = path.join(tmp, "voz" + i + ".wav");
    await ffmpeg(["-i", f, "-ac", "2", "-ar", "44100", wav]);
    voces.push(wav);
  }
  // silencio entre frases
  const pausa = path.join(tmp, "pausa.wav");
  await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", String(m.pausa || 0.7), pausa]);
  const lista = path.join(tmp, "lista.txt");
  const lineas = [];
  voces.forEach((v, i) => { lineas.push("file '" + v + "'"); if (i < voces.length - 1) lineas.push("file '" + pausa + "'"); });
  fs.writeFileSync(lista, lineas.join("\n"));
  const vozTotal = path.join(tmp, "voz-total.wav");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", vozTotal]);

  // musica: local o url
  let musica = m.musica;
  if (/^https?:/.test(musica)) { const f = path.join(tmp, "musica.mp3"); await bajar(musica, f); musica = f; }

  const salida = path.join(DIR, m.id + ".mp3");
  const vol = m.volumenMusica ?? 0.3;
  // la musica se recorta a la voz mas 1,5 s y se funde al final
  await ffmpeg([
    "-i", vozTotal, "-stream_loop", "-1", "-i", musica,
    "-filter_complex",
    `[1:a]volume=${vol},afade=t=in:st=0:d=1[m];[0:a]apad=pad_dur=1.5[v];[v][m]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[out]`,
    "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "160k", salida
  ]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return salida;
}

export async function prepararTodas() {
  const f = path.join(process.cwd(), "mezclas.json");
  if (!fs.existsSync(f)) return;
  const mezclas = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const m of mezclas) {
    try { await prepararMezcla(m); console.log("mezcla lista:", m.id); }
    catch (e) { console.error("mezcla fallo:", m.id, e.message); }
  }
}

export function rutaMezcla(id) {
  const f = path.join(DIR, id + ".mp3");
  return fs.existsSync(f) ? f : null;
}
