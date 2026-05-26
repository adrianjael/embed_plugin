/**
 * CinemaCity Provider for NuvioSniffer
 * Port del proveedor de easystreams adaptado para Nuvio.
 * Resuelve la URL canónica desde el sitemap y la entrega al
 * Webview invisible con el sufijo ?s=X&e=Y para automatizar
 * el reproductor sin necesidad de clics.
 */

const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
const BASE_URL = "https://cinemacity.cc";
const SITEMAP_URL = `${BASE_URL}/news_pages.xml`;
const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

// Decode the Base64 session cookie
const SESSION_COOKIE = "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;";

// Caché en memoria para el sitemap
let sitemapCache = null;
const SITEMAP_TTL_MS = 60 * 60 * 1000; // 1 hora

async function safeFetch(url, options = {}) {
    if (typeof browserFetch === "function") {
        try {
            console.log(`[CinemaCity] Usando browserFetch para evitar Cloudflare: ${url}`);
            const res = await browserFetch(url);
            if (res && res.ok) return res;
            console.log(`[CinemaCity] browserFetch falló con status: ${res ? res.status : "Desconocido"}`);
        } catch (e) {
            console.log(`[CinemaCity] Error en browserFetch: ${e.message}`);
        }
    }
    return await fetch(url, options).catch(() => null);
}

function normalizeTitle(value) {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\([^)]*\)/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function compactTitle(value) {
    return normalizeTitle(value).replace(/\s+/g, "");
}

const STOPWORDS = new Set([
    'the','a','an','of','and','in','on','to','for','at','by','is','it',
    'il','lo','la','gli','le','un','uno','una','di','da','del','della','dei',
    'e','o','con','per','su','tra','fra',
]);

function getSignificantTokens(value) {
    return normalizeTitle(value).split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function parseSitemapEntries(xml) {
    const entries = [];
    const re = /<loc>(https:\/\/cinemacity\.cc\/(movies|tv-series)\/\d+-([a-z0-9-]+)\.html)<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
        const url = m[1];
        const kind = m[2];
        const slug = m[3];
        const yearMatch = slug.match(/-(\d{4})$/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
        const titleSlug = yearMatch ? slug.slice(0, -5) : slug;
        const title = titleSlug.replace(/-/g, " ");
        entries.push({
            url,
            kind,
            title,
            normalizedTitle: normalizeTitle(title),
            compactTitle: compactTitle(title),
            tokens: getSignificantTokens(title),
            year: Number.isInteger(year) ? year : null,
        });
    }
    return entries;
}

async function fetchSitemap() {
    if (sitemapCache && sitemapCache.expiresAt > Date.now()) {
        return sitemapCache.entries;
    }
    console.log(`[CinemaCity] Descargando Sitemap: ${SITEMAP_URL}`);
    const r = await safeFetch(SITEMAP_URL, {
        headers: {
            "User-Agent": UA,
            "Accept": "application/xml,text/xml,text/html;q=0.9,*/*;q=0.8",
            "Referer": `${BASE_URL}/`,
            "Cookie": SESSION_COOKIE
        }
    });

    if (!r || !r.ok) {
        console.log(`[CinemaCity] Fallo al descargar sitemap (posible Cloudflare). Code: ${r ? r.status : "Err"}`);
        return [];
    }

    const xmlText = await r.text();
    const entries = parseSitemapEntries(xmlText);
    
    // Si la descarga falló o es muy pequeña (captcha de Cloudflare)
    if (entries.length < 10) {
        console.log(`[CinemaCity] Sitemap inválido o bloqueado por CF.`);
        return [];
    }

    sitemapCache = { entries, expiresAt: Date.now() + SITEMAP_TTL_MS };
    console.log(`[CinemaCity] Sitemap cacheado con ${entries.length} entradas.`);
    return entries;
}

function scoreEntry(entry, expectedTitles, expectedYear) {
    let best = 0;
    for (const title of expectedTitles) {
        const norm = normalizeTitle(title);
        const comp = compactTitle(title);
        if (!norm || !comp) continue;
        
        let score = 0;
        if (entry.normalizedTitle === norm || entry.compactTitle === comp) score = 1000;
        else if (entry.normalizedTitle.startsWith(norm) || norm.startsWith(entry.normalizedTitle)) score = 500;
        else if (entry.compactTitle.includes(comp) || comp.includes(entry.compactTitle)) score = 420;
        else {
            const exp = getSignificantTokens(title);
            if (exp.length && entry.tokens.length) {
                let hits = 0;
                const set = new Set(entry.tokens);
                for (const t of exp) if (set.has(t)) hits++;
                const coverage = hits / exp.length;
                const extra = Math.max(0, entry.tokens.length - exp.length);
                score = coverage * 300 - extra * 20 - Math.abs(entry.tokens.length - exp.length) * 2;
            }
        }
        if (expectedYear && entry.year) {
            score += entry.year === expectedYear ? 50 : -Math.abs(entry.year - expectedYear) * 3;
        }
        if (score > best) best = score;
    }
    return best;
}

async function getStreams(tmdbId, mediaType, season, episode, title) {
    try {
        let cleanId = String(tmdbId).trim();
        
        // Limpieza
        if (cleanId.includes("|")) cleanId = cleanId.split("|")[0];
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "")
            .split(":")[0].split("/")[0];

        const isMovie = ["movie", "film"].includes(String(mediaType).toLowerCase());
        const expectedKind = isMovie ? "movies" : "tv-series";

        let expectedTitles = title ? [title] : [];
        let year = null;

        if (cleanId && cleanId !== "undefined" && cleanId !== "null") {
            try {
                let tmdbUrl = "";
                if (cleanId.startsWith("tt")) {
                    tmdbUrl = `https://api.themoviedb.org/3/find/${cleanId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
                } else {
                    tmdbUrl = `https://api.themoviedb.org/3/${isMovie ? "movie" : "tv"}/${cleanId}?api_key=${TMDB_API_KEY}`;
                }
                
                const tmdbRes = await fetch(tmdbUrl, { headers: { "User-Agent": UA } }).catch(() => null);
                if (tmdbRes && tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    let mediaInfo = null;
                    
                    if (cleanId.startsWith("tt")) {
                        const results = isMovie ? data.movie_results : data.tv_results;
                        if (results && results.length > 0) mediaInfo = results[0];
                    } else {
                        mediaInfo = data;
                    }

                    if (mediaInfo) {
                        if (mediaInfo.title) expectedTitles.push(mediaInfo.title);
                        if (mediaInfo.name) expectedTitles.push(mediaInfo.name);
                        if (mediaInfo.original_title) expectedTitles.push(mediaInfo.original_title);
                        if (mediaInfo.original_name) expectedTitles.push(mediaInfo.original_name);
                        
                        const dateStr = mediaInfo.release_date || mediaInfo.first_air_date;
                        if (dateStr) {
                            year = parseInt(dateStr.substring(0, 4), 10);
                        }
                    }
                }
            } catch (e) {
                console.log(`[CinemaCity] Error TMDB: ${e.message}`);
            }
        }

        expectedTitles = Array.from(new Set(expectedTitles.filter(Boolean)));
        if (!expectedTitles.length) {
            console.log("[CinemaCity] No hay títulos válidos para buscar.");
            return [];
        }

        const entries = await fetchSitemap();
        if (!entries || entries.length === 0) {
            // Fallback a la búsqueda web si el sitemap falla o es bloqueado
            console.log("[CinemaCity] Sitemap fallido. Realizando fallback a búsqueda por Web.");
            return await fallbackSearch(expectedTitles[0], isMovie, season, episode);
        }

        let best = null;
        let bestScore = -Infinity;

        for (const e of entries) {
            if (e.kind !== expectedKind) continue;
            const s = scoreEntry(e, expectedTitles, year);
            if (s > bestScore) {
                bestScore = s;
                best = e;
            }
        }

        if (!best || bestScore < 250) {
            console.log(`[CinemaCity] No hay coincidencia segura (Mejor score: ${Math.round(bestScore)})`);
            return await fallbackSearch(expectedTitles[0], isMovie, season, episode);
        }

        console.log(`[CinemaCity] Sitemap Match: ${best.url} [Score: ${Math.round(bestScore)}]`);

        let targetUrl = best.url;
        if (!isMovie && season && episode) {
            const sep = targetUrl.includes("?") ? "&" : "?";
            targetUrl += `${sep}s=${season}&e=${episode}`;
        }

        const results = [];
        const item = {
            name: `CinemaCity - ${isMovie ? "Pelicula" : `S${season}E${episode}`}`,
            language: "Multi",
            quality: "HD",
            url: targetUrl,
            behaviorHints: {
                notWebReady: true,
                isEmbed: true
            }
        };

        if (typeof __yield_result === "function") {
            __yield_result(JSON.stringify(item));
        }
        
        results.push(item);
        return results;

    } catch (e) {
        console.log(`[CinemaCity] Error Crítico: ${e.message}`);
        return [];
    }
}

// Fallback search en caso de que Sitemap sea inaccesible
async function fallbackSearch(searchTitle, isMovie, season, episode) {
    try {
        if (!searchTitle) {
            console.log("[CinemaCity] searchTitle is undefined in fallbackSearch");
            return [];
        }
        const encodedTitle = encodeURIComponent(String(searchTitle).trim());
        const searchUrl = `${MAIN_URL}/?do=search&subaction=search&search_start=0&full_search=0&story=${encodedTitle}`;
        
        console.log(`[CinemaCity] Fallback search: ${searchUrl}`);
        const res = await safeFetch(searchUrl, { 
            headers: { 
                "User-Agent": UA,
                "Referer": "https://cinemacity.cc/" 
            } 
        });

        if (!res || !res.ok) return [];

        const html = await res.text();
        if (html.includes("cf-turnstile") || html.includes("Just a moment")) {
            console.log("[CinemaCity] Búsqueda bloqueada por CF.");
            return [];
        }

        const $ = cheerio.load(html);
        let mediaUrl = null;
        const targetKind = isMovie ? "/movies/" : "/tv-series/";

        $("div.dar-short_item").each((i, el) => {
            if (mediaUrl) return;
            const anchor = $(el).find("a").first();
            const href = anchor.attr("href") || "";
            if (href.includes(targetKind)) {
                const foundTitle = anchor.text().trim().toLowerCase();
                const targetTitle = searchTitle.toLowerCase();
                if (foundTitle.includes(targetTitle) || targetTitle.includes(foundTitle.split('(')[0].trim())) {
                    mediaUrl = href;
                }
            }
        });

        if (!mediaUrl) return [];

        let targetUrl = mediaUrl;
        if (!isMovie && season && episode) {
            const sep = targetUrl.includes("?") ? "&" : "?";
            targetUrl += `${sep}s=${season}&e=${episode}`;
        }

        const item = {
            name: `CinemaCity - ${isMovie ? "Pelicula" : `S${season}E${episode}`}`,
            language: "Multi",
            quality: "HD",
            url: targetUrl,
            behaviorHints: {
                notWebReady: true,
                isEmbed: true
            }
        };

        if (typeof __yield_result === "function") {
            __yield_result(JSON.stringify(item));
        }
        
        return [item];
        return [item];
    } catch (e) {
        console.log(`[CinemaCity] Error en fallbackSearch: ${e.message} - Stack: ${e.stack}`);
        return [];
    }
}

module.exports = { getStreams };
