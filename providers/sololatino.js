/**
 * SoloLatino Provider for NuvioSniffer
 * Scrapes player.pelisserieshoy.com and delivers all server embeds to Nuvio.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const HOST = "https://player.pelisserieshoy.com";
const REFERER_BASE = "https://sololatino.net/";

async function getImdbId(tmdbId, mediaType) {
    try {
        const type = String(mediaType || "").toLowerCase().includes("movie") ? "movie" : "tv";
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) return null;
        const data = await res.json();
        return data ? data.imdb_id || null : null;
    } catch (e) {
        console.log(`[SoloLatino] Error obteniendo IMDB: ${e.message}`);
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let cleanId = String(tmdbId).trim();
        if (cleanId.includes("|")) cleanId = cleanId.split("|")[0];
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "").split(":")[0].split("/")[0];
        if (!cleanId || cleanId === "null" || cleanId === "undefined") return [];

        let imdbId = cleanId.startsWith("tt") ? cleanId : null;
        if (!imdbId) {
            imdbId = await getImdbId(cleanId, mediaType);
        }
        if (!imdbId) return [];

        const isMovie = ["movie", "film"].includes(String(mediaType).toLowerCase());
        const ep = String(episode || 1).padStart(2, "0");
        const slug = isMovie ? imdbId : `${imdbId}-${season || 1}x${ep}`;
        const oWeb = `${HOST}/f/${slug}`;

        console.log(`[SoloLatino] Buscando en: ${oWeb}`);

        const headers = { "User-Agent": UA, "Referer": REFERER_BASE };
        const response = await fetch(oWeb, { headers });
        if (!response.ok) return [];
        const html = await response.text();

        const setCookieHeaders = response.headers.get("set-cookie");
        let cookie = "";
        if (setCookieHeaders) {
            cookie = setCookieHeaders.split(",").map(c => c.split(";")[0].trim()).join("; ");
        }

        const tokenMatch = html.match(/(?:let\s+token|const\s+_t|tok|_t|token)\s*.*['"]([a-f0-9]{32})['"]/i);
        const token = tokenMatch ? tokenMatch[1] : "";
        if (!token) {
            console.log("[SoloLatino] No se encontró token en la página.");
            return [];
        }

        const commonHeaders = {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": oWeb,
            "X-Requested-With": "XMLHttpRequest"
        };
        if (cookie) commonHeaders["Cookie"] = cookie;

        // Click de activación
        await fetch(`${HOST}/s.php`, { method: "POST", headers: commonHeaders, body: `a=click&tok=${token}` }).catch(() => {});

        // Listar servidores
        const listRes = await fetch(`${HOST}/s.php`, { method: "POST", headers: commonHeaders, body: `a=1&tok=${token}` });
        const listData = await listRes.json();

        // Obtener servidores en Latino
        const latServers = (listData.langs_s && listData.langs_s.LAT) || listData.s || [];
        console.log(`[SoloLatino] Servidores encontrados: ${latServers.length}`);

        const results = [];

        for (const srv of latServers) {
            try {
                const srvName = srv[0] || "Server";
                const srvId = srv[1];

                const sResponse = await fetch(`${HOST}/s.php`, {
                    method: "POST",
                    headers: { ...commonHeaders, "Origin": HOST },
                    body: `a=2&v=${srvId}&tok=${token}`
                });
                const sData = await sResponse.json();
                if (!sData || !sData.u) continue;

                let videoUrl = sData.u;

                // Si la URL apunta a la API interna de source, resolverla
                if (videoUrl.includes("/api/source/")) {
                    try {
                        const domain = new URL(videoUrl).hostname;
                        const apiRes = await fetch(videoUrl, {
                            method: "POST",
                            headers: {
                                "User-Agent": UA,
                                "Content-Type": "application/x-www-form-urlencoded",
                                "Referer": oWeb,
                                "origin": HOST
                            },
                            body: `r=https%3A%2F%2Fre.sololatino.net%2F&d=${domain}`
                        });
                        const apiData = await apiRes.json();
                        if (apiData.success && apiData.data && apiData.data.length > 0) {
                            videoUrl = apiData.data[apiData.data.length - 1].file;
                        }
                    } catch (e) {
                        console.log(`[SoloLatino] Error resolviendo API source para ${srvName}: ${e.message}`);
                    }
                }

                if (!videoUrl.startsWith("http")) {
                    videoUrl = HOST + videoUrl;
                }

                // Detectar si es URL directa (mp4, m3u8, mediafire) o embed
                const lowUrl = videoUrl.toLowerCase();
                const isDirect = lowUrl.includes(".mp4") || lowUrl.includes(".m3u8") || lowUrl.includes("mediafire.com") || lowUrl.includes("/download");

                const item = {
                    name: `SOLOLATINO - ${srvName.toUpperCase()}`,
                    language: "Latino",
                    quality: "HD",
                    url: videoUrl,
                    headers: {
                        "User-Agent": UA,
                        "Referer": `${HOST}/`
                    }
                };

                if (!isDirect) {
                    item.behaviorHints = {
                        notWebReady: true,
                        isEmbed: true
                    };
                }

                console.log(`[SoloLatino] >> ${srvName} -> ${isDirect ? "Directo" : "Embed"}: ${videoUrl.substring(0, 80)}`);

                if (typeof __yield_result === "function") {
                    __yield_result(JSON.stringify(item));
                }
                results.push(item);

                if (typeof __native_sleep === "function") {
                    await __native_sleep(30);
                }
            } catch (e) {
                console.log(`[SoloLatino] Error en servidor: ${e.message}`);
            }
        }

        return results;
    } catch (e) {
        console.log(`[SoloLatino] Error Crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
