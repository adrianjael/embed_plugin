/**
 * Test script for Embed69 Provider
 * Simula el entorno de la App para probar la extracción.
 */

const provider = require('./providers/embed69.js');

// Mocking the App globals
global.fetch = async (url, options) => {
    console.log(`[Mock Fetch] --> ${url}`);
    // Usamos el fetch nativo de Node 18+
    return await require('node-fetch')(url, options);
};

global.__yield_result = (json) => {
    const item = JSON.parse(json);
    console.log(`[Yielded Stream] Found: ${item.name} | URL: ${item.url.substring(0, 50)}...`);
};

global.__native_sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    // Capturar argumentos: node test.js <id> <tipo>
    // Ejemplo: node test.js tt0816692 movie
    // Ejemplo: node test.js 157336 movie
    const args = process.argv.slice(2);
    
    const inputId = args[0] || "157336"; // Interstellar por defecto
    const mediaType = args[1] || "movie";
    
    console.log(`=== INICIANDO TEST DE EMBED69 (SNIFFER MODE) ===`);
    console.log(`ID: ${inputId} | Tipo: ${mediaType}`);
    
    try {
        const results = await provider.getStreams(inputId, mediaType);
        console.log("\n=== RESULTADOS FINALES ===");
        console.log(`Total enlaces encontrados: ${results.length}`);
        
        results.forEach((res, i) => {
            console.log(`${i+1}. ${res.name.padEnd(20)} [${res.language}] -> isEmbed: ${res.behaviorHints?.isEmbed}`);
            console.log(`   URL: ${res.url}\n`);
        });
        
    } catch (e) {
        console.error("Error durante el test:", e);
    }
}

// Necesitas instalar node-fetch para correr esto localmente: npm install node-fetch
runTest();
