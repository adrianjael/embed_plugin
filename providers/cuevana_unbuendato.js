/**
 * Cuevana Unbuendato Provider for NuvioSniffer
 * Entrega los embeds de la API de cuevana.unbuendato.com para Sniffing automático.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let cleanId = String(tmdbId).trim();
        
        // Limpieza de ID
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "")
            .split("|")[0].split(":")[0].split("/")[0];

        const type = ["movie", "film"].includes(String(mediaType).toLowerCase()) ? "movie" : "tv";
        
        let apiUrl = `https://cuevana.unbuendato.com/?id=${cleanId}`;
        if (type === "tv" && season && episode) {
            apiUrl += `&season=${season}&episode=${episode}`;
        }

        console.log(`[CuevanaDato] Consultando API: ${apiUrl}`);

        const response = await fetch(apiUrl, { 
            headers: { 
                "User-Agent": UA,
                "Accept": "application/json"
            } 
        });
        
        const data = await response.json();

        if (!data.success || !data.languages) {
            console.log(`[CuevanaDato] API no retornó resultados válidos.`);
            return [];
        }

        const results = [];

        // Procesar solo Latino (Pedido del usuario)
        const latinoServers = data.languages.latino;
        
        if (latinoServers) {
            for (const [sName, embedUrl] of Object.entries(latinoServers)) {
                try {
                    if (!embedUrl || !embedUrl.startsWith("http")) continue;

                    // Filtrar Netu/Waaw ya que no se pueden extraer con fiabilidad
                    const lowServerName = sName.toLowerCase();
                    const lowUrl = embedUrl.toLowerCase();
                    if (
                        lowServerName.includes("netu") || lowServerName.includes("waaw") || lowServerName.includes("hani") ||
                        lowUrl.includes("waaw.to") || lowUrl.includes("netu.tv") || lowUrl.includes("netu.to") || 
                        lowUrl.includes("hani.to") || lowUrl.includes("waaw.tv")
                    ) {
                        console.log(`[CuevanaDato] Ignorando servidor Netu/Waaw detectado: ${sName} (${embedUrl})`);
                        continue;
                    }

                    const item = {
                        name: sName.toUpperCase() + " (Sniffer)",
                        language: "Latino",
                        quality: "HD",
                        url: embedUrl,
                        behaviorHints: {
                            notWebReady: true,
                            isEmbed: true
                        }
                    };

                    console.log(`[CuevanaDato] >> Encontrado: ${sName} (Latino)`);
                    if (typeof __yield_result === "function") __yield_result(JSON.stringify(item));
                    results.push(item);

                    if (typeof __native_sleep === "function") await __native_sleep(30);
                } catch (e) {
                    console.log(`[CuevanaDato] Error en servidor ${sName}: ${e.message}`);
                }
            }
        }

        return results;
    } catch (e) {
        console.log(`[CuevanaDato] Error Crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
