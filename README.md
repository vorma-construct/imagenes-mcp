# Servidor de imágenes (para conectar a Claude)

Genera imágenes gratis con Pollinations y las devuelve en el chat.

## Desplegar en Railway
1. Nuevo proyecto desde este repositorio.
2. No hace falta ninguna variable. Opcional: `CLAVE_POLLINATIONS` si algún día se usa cuenta propia.
3. Genera dominio público.

## Conectar en Claude
Ajustes → Conectores → Añadir conector personalizado
- Nombre: Imágenes
- Dirección: https://TU-DOMINIO.up.railway.app/mcp
- Sin inicio de sesión

## Herramientas
- generar_imagen: la crea y la enseña en el chat
- direccion_de_imagen: solo la dirección, para pegar en una web
- generar_varias: hasta seis de una vez
