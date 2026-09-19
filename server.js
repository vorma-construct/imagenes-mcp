/* Servidor de imágenes para Claude.
   Genera imágenes con Pollinations (gratis) y las devuelve al chat. */
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { prepararTodas, rutaMezcla } from "./mezclas.js";

const BASE = process.env.BASE_IMAGENES || "https://image.pollinations.ai/prompt/";
const CLAVE = process.env.CLAVE_POLLINATIONS || "";

function direccionDe({ texto, ancho, alto, modelo, semilla, sinMarca }) {
  const p = new URLSearchParams();
  p.set("width", String(ancho || 1024));
  p.set("height", String(alto || 1024));
  if (modelo) p.set("model", modelo);
  if (semilla != null) p.set("seed", String(semilla));
  if (sinMarca !== false) p.set("nologo", "true");
  p.set("safe", "false");
  if (CLAVE) p.set("key", CLAVE);
  return BASE + encodeURIComponent(texto) + "?" + p.toString();
}

async function bajarImagen(url) {
  const r = await fetch(url, { headers: { "User-Agent": "ImagenesMCP/1.0" } });
  if (!r.ok) throw new Error("La imagen no se pudo generar (" + r.status + ")");
  const buf = Buffer.from(await r.arrayBuffer());
  const tipo = r.headers.get("content-type") || "image/jpeg";
  return { base64: buf.toString("base64"), tipo, bytes: buf.length };
}

function nuevoServidor() {
  const s = new McpServer({ name: "imagenes", version: "1.0.0" });

  s.registerTool(
    "generar_imagen",
    {
      title: "Generar una imagen",
      description:
        "Genera una imagen a partir de una descripción en texto y la devuelve en el chat. Gratis, sin límite de créditos.",
      inputSchema: {
        descripcion: z.string().describe("Qué se quiere ver en la imagen. Cuanto más detallado, mejor. Puede ir en inglés."),
        ancho: z.number().int().min(256).max(2048).optional().describe("Ancho en píxeles (por defecto 1024)"),
        alto: z.number().int().min(256).max(2048).optional().describe("Alto en píxeles (por defecto 1024)"),
        modelo: z.string().optional().describe("Modelo: flux (por defecto), turbo, kontext"),
        semilla: z.number().int().optional().describe("Número para repetir exactamente la misma imagen"),
      },
    },
    async ({ descripcion, ancho, alto, modelo, semilla }) => {
      const url = direccionDe({ texto: descripcion, ancho, alto, modelo, semilla });
      try {
        const img = await bajarImagen(url);
        return {
          content: [
            { type: "image", data: img.base64, mimeType: img.tipo },
            { type: "text", text: "Dirección directa de la imagen:\n" + url },
          ],
        };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: String(e.message || e) }] };
      }
    }
  );

  s.registerTool(
    "direccion_de_imagen",
    {
      title: "Dirección de una imagen (sin generarla ahora)",
      description:
        "Devuelve solo la dirección web de la imagen, para pegarla en una página. La imagen se crea sola la primera vez que alguien la abre.",
      inputSchema: {
        descripcion: z.string(),
        ancho: z.number().int().min(256).max(2048).optional(),
        alto: z.number().int().min(256).max(2048).optional(),
        modelo: z.string().optional(),
        semilla: z.number().int().optional(),
      },
    },
    async (a) => ({
      content: [{ type: "text", text: direccionDe({ texto: a.descripcion, ancho: a.ancho, alto: a.alto, modelo: a.modelo, semilla: a.semilla }) }],
    })
  );

  s.registerTool(
    "generar_varias",
    {
      title: "Generar varias imágenes de una vez",
      description: "Genera hasta seis imágenes a partir de varias descripciones.",
      inputSchema: {
        descripciones: z.array(z.string()).min(1).max(6),
        ancho: z.number().int().min(256).max(2048).optional(),
        alto: z.number().int().min(256).max(2048).optional(),
        modelo: z.string().optional(),
      },
    },
    async ({ descripciones, ancho, alto, modelo }) => {
      const partes = [];
      for (const d of descripciones) {
        const url = direccionDe({ texto: d, ancho, alto, modelo });
        try {
          const img = await bajarImagen(url);
          partes.push({ type: "text", text: "— " + d });
          partes.push({ type: "image", data: img.base64, mimeType: img.tipo });
        } catch (e) {
          partes.push({ type: "text", text: "— " + d + " (no salió: " + e.message + ")" });
        }
      }
      return { content: partes };
    }
  );

  return s;
}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "*");
  res.set("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (_req, res) => res.json({ ok: true, servidor: "imagenes", conectar_en: "/mcp" }));
app.get("/salud", (_req, res) => res.json({ ok: true }));

/* pagina con reproductor, para oir una mezcla desde el movil sin descargar nada */
app.get("/escuchar/:id", (req, res) => {
  const id = req.params.id.replace(/[^a-z0-9-]/gi, "");
  const f = rutaMezcla(id);
  if (!f) return res.status(404).send("Todavia no esta lista; vuelve a probar en un minuto.");
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Escuchar ${id}</title>
<style>body{margin:0;background:#1c1f22;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:22px;padding:24px;text-align:center}
h1{font-size:22px;margin:0}audio{width:100%;max-width:520px}a{color:#C99A2E;font-weight:700}
button{background:#A87B18;color:#fff;border:0;border-radius:40px;padding:16px 28px;font-size:19px;font-weight:700}</style></head>
<body><h1>${id}</h1>
<button id="b" onclick="var a=document.getElementById('a');a.play();this.textContent='Sonando…'">▶ Escuchar</button>
<audio id="a" controls preload="auto" src="/mezcla/${id}.mp3"></audio>
<p><a href="/mezcla/${id}.mp3" download="${id}.mp3">Descargar el mp3</a></p>
</body></html>`);
});

/* mezclas de audio ya preparadas: /mezcla/<id>.mp3 */
app.get("/mezcla/:id.mp3", (req, res) => {
  const f = rutaMezcla(req.params.id);
  if (!f) return res.status(404).send("todavia no esta lista; vuelve a probar en un minuto");
  res.set("Content-Type", "audio/mpeg"); res.set("Cache-Control", "no-store");
  res.sendFile(f);
});

async function atender(req, res) {
  const servidor = nuevoServidor();
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transporte.close(); servidor.close(); });
  await servidor.connect(transporte);
  await transporte.handleRequest(req, res, req.body);
}

app.post("/mcp", atender);
app.get("/mcp", (_req, res) => res.status(405).json({ error: "usa POST" }));

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => { console.log("servidor de imagenes escuchando en", PUERTO); prepararTodas().catch(e => console.error(e)); });
