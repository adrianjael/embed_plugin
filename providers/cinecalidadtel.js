const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const SITE_URL = "https://cinecalidad.tel";

function normalize(str) {
    if (!str) return "";
    return str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanTitle(title) {
    if (!title) return "";
    return title.replace(/\(\d{4}\)/g, "").trim();
}

function isMatch(postTitle, targetTitle, postSlug, postYear, targetYear) {
    const pTitle = normalize(cleanTitle(postTitle));
    const tTitle = normalize(targetTitle);

    let yearOk = true;
    if (postYear && targetYear) {
        yearOk = Math.abs(parseInt(postYear) - parseInt(targetYear)) <= 1;
    }

    if (pTitle === tTitle) return true;

    if (pTitle.includes(tTitle) || tTitle.includes(pTitle)) {
        return yearOk;
    }

    const normTarget = normalize(targetTitle).replace(/ /g, "-");
    if (postSlug) {
        const normSlug = normalize(postSlug);
        if (normSlug.includes(normTarget) || normTarget.includes(normSlug)) return yearOk;
    }

    const wordsP = pTitle.split(" ").filter(w => w.length > 2);
    const wordsT = tTitle.split(" ").filter(w => w.length > 2);
    if (wordsP.length === 0 || wordsT.length === 0) return false;

    const intersection = wordsP.filter(w => wordsT.includes(w));
    const overlap = intersection.length / Math.max(wordsP.length, wordsT.length);

    return overlap >= 0.7 && yearOk;
}

function decodeBase64(str) {
    try {
        return atob(str);
    } catch (e) {
        try {
            const { Buffer } = require("buffer");
            return Buffer.from(str, "base64").toString("utf-8");
        } catch (e2) {
            return null;
        }
    }
}

async function searchCinecalidad(query) {
    const url = `${SITE_URL}/wp-json/wp/v2/movies?search=${encodeURIComponent(query)}&per_page=10`;
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": UA, "Accept": "application/json" }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.log(`[CinecalidadTel] Error buscando "${query}": ${e.message}`);
        return null;
    }
}

async function extractEmbedsFromHTML(url) {
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": UA, "Accept": "text/html" }
        });
        const html = await response.text();
        const results = [];

        const blockRegex = /<a[^>]*data-src="([^"]+)"[^>]*data-option[^>]*>\s*([^<]+)<\/a>/g;
        let match;

        while ((match = blockRegex.exec(html)) !== null) {
            const encoded = match[1];
            const decoded = decodeBase64(encoded);
            let serverName = match[2] ? match[2].trim() : "Server";

            if (decoded && decoded.startsWith("http")) {
                const item = {
                    name: "CinecalidadTel",
                    title: serverName.charAt(0).toUpperCase() + serverName.slice(1),
                    url: decoded,
                    behaviorHints: {
                        notWebReady: true,
                        isEmbed: true
                    }
                };
                results.push(item);
                if (typeof __yield_result === "function") {
                    __yield_result(JSON.stringify(item));
                }
            }
        }

        return results;
    } catch (e) {
        console.log(`[CinecalidadTel] Error extrayendo embeds de ${url}: ${e.message}`);
        return [];
    }
}

async function findSeriesSlug(query, targetYear) {
    const url = `${SITE_URL}/?s=${encodeURIComponent(query)}`;
    try {
        const response = await fetch(url, {
            headers: { "User-Agent": UA, "Accept": "text/html" }
        });
        const html = await response.text();

        const serieRegex = /href="(https?:\/\/[^"]*\/serie\/([^"\/]+)\/)"/gi;
        const matches = [];
        let match;
        while ((match = serieRegex.exec(html)) !== null) {
            const slug = decodeURIComponent(match[2]).toLowerCase();
            if (!matches.find(m => m.slug === slug)) {
                matches.push({ slug, link: match[1] });
            }
        }

        if (matches.length === 0) return null;

        const normQuery = normalize(query).replace(/\s+/g, "-");
        let bestCandidate = null;
        let bestScore = 0;

        for (const c of matches) {
            const normSlug = c.slug.replace(/-/g, " ");
            let score = 0;

            if (c.slug === normQuery) {
                score = 100;
            } else if (c.slug.includes(normQuery) && normQuery.length >= 3) {
                score = 80;
            } else if (normQuery.includes(c.slug) && c.slug.length >= 3) {
                score = 75;
            }

            const slugWords = normSlug.split(" ").filter(w => w.length > 2);
            const queryWords = normalize(query).split(" ").filter(w => w.length > 2);
            if (queryWords.length > 0 && slugWords.length > 0) {
                const common = slugWords.filter(w => queryWords.includes(w));
                if (common.length > 0) {
                    score = Math.max(score, (common.length / Math.max(queryWords.length, slugWords.length)) * 90);
                }
            }

            if (normQuery.length <= 4 && c.slug === normQuery) {
                score = 100;
            }

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = c;
            }
        }

        return bestScore >= 40 ? bestCandidate : null;
    } catch (e) {
        console.log(`[CinecalidadTel] Error buscando serie "${query}": ${e.message}`);
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        let cleanId = String(tmdbId).trim();

        if (cleanId.includes("|")) {
            const parts = cleanId.split("|");
            cleanId = parts[0];
        }

        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "")
            .split(":")[0].split("/")[0];

        if (!cleanId || cleanId === "null" || cleanId === "undefined") {
            console.log("[CinecalidadTel] ID inválido.");
            return [];
        }

        const isTv = !["movie", "film"].includes(String(mediaType).toLowerCase());
        const type = isTv ? "tv" : "movie";

        console.log(`[CinecalidadTel] Resolviendo metadata TMDB para ID: ${cleanId} (${type})`);

        let tmdbData = null;
        const isImdb = cleanId.startsWith("tt");

        if (isImdb) {
            const findUrl = `https://api.themoviedb.org/3/find/${cleanId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=es-MX`;
            const resFind = await fetch(findUrl);
            if (resFind.ok) {
                const findData = await resFind.json();
                const results = isTv ? findData.tv_results : findData.movie_results;
                if (results && results.length > 0) {
                    tmdbData = results[0];
                }
            }
        }

        if (!tmdbData && !isImdb) {
            const tmdbUrl = `https://api.themoviedb.org/3/${type}/${cleanId}?api_key=${TMDB_API_KEY}&language=es-MX`;
            const resTMDB = await fetch(tmdbUrl);
            if (resTMDB.ok) {
                tmdbData = await resTMDB.json();
            }
        }

        if (!tmdbData) {
            console.log(`[CinecalidadTel] No se encontró info en TMDB para ID: ${cleanId}`);
            return [];
        }

        const title = tmdbData.title || tmdbData.name || tmdbData.original_title || tmdbData.original_name;
        const originalTitle = tmdbData.original_title || tmdbData.original_name;
        const year = tmdbData.release_date ? tmdbData.release_date.substring(0, 4) :
            (tmdbData.first_air_date ? tmdbData.first_air_date.substring(0, 4) : "");

        console.log(`[CinecalidadTel] Título: "${title}" | Año: ${year}`);

        if (isTv) {
            if (!season || !episode) {
                console.log("[CinecalidadTel] Falta temporada o episodio para serie.");
                return [];
            }
            const queries = [title];
            if (originalTitle && originalTitle !== title) queries.push(originalTitle);
            const partTitle = title.split(/[:\-]/)[0].trim();
            if (partTitle !== title) queries.push(partTitle);

            const uniqueQueries = [...new Set(queries)].filter(q => q && q.length >= 2);
            let seriesSlug = null;

            for (const q of uniqueQueries) {
                console.log(`[CinecalidadTel] Buscando serie: "${q}"`);
                const result = await findSeriesSlug(q, year);
                if (result) {
                    seriesSlug = result.slug;
                    console.log(`[CinecalidadTel] Serie encontrada: "${result.title}" (slug: ${seriesSlug})`);
                    break;
                }
            }

            if (!seriesSlug) {
                console.log(`[CinecalidadTel] No se encontró la serie: "${title}"`);
                return [];
            }

            const episodeUrl = `${SITE_URL}/episodes/${seriesSlug}-${season}x${episode}/`;
            console.log(`[CinecalidadTel] URL del episodio: ${episodeUrl}`);
            return await extractEmbedsFromHTML(episodeUrl);
        }

        const queries = [title];
        if (originalTitle && originalTitle !== title) queries.push(originalTitle);
        const partTitle = title.split(/[:\-]/)[0].trim();
        if (partTitle !== title) queries.push(partTitle);

        const uniqueQueries = [...new Set(queries)].filter(q => q && q.length >= 2);
        let targetPost = null;
        let bestScore = 0;

        for (const q of uniqueQueries) {
            console.log(`[CinecalidadTel] Buscando: "${q}"`);
            const data = await searchCinecalidad(q);
            if (!data || data.length === 0) continue;

            for (const post of data) {
                const postYear = "";
                const match = post.class_list && post.class_list.find(c => c.startsWith("annee-"));
                const postYearStr = match ? match.replace("annee-", "") : "";
                const titleMatch = isMatch(post.title.rendered, title, post.slug, postYearStr, year);

                if (titleMatch) {
                    const pTitle = normalize(cleanTitle(post.title.rendered));
                    const tTitle = normalize(title);
                    const score = pTitle === tTitle ? 100 :
                        pTitle.includes(tTitle) || tTitle.includes(pTitle) ? (pTitle.length / tTitle.length) * 50 :
                        [...new Set(pTitle.split(" "))].filter(w => tTitle.includes(w)).length / Math.max(pTitle.split(" ").length, tTitle.split(" ").length) * 40;
                    if (score > bestScore) {
                        bestScore = score;
                        targetPost = post;
                    }
                }
            }
        }

        if (!targetPost) {
            console.log(`[CinecalidadTel] No se encontró contenido para: "${title}" (${year})`);
            return [];
        }

        console.log(`[CinecalidadTel] Encontrado: "${targetPost.title.rendered}" (${targetPost.link})`);

        return await extractEmbedsFromHTML(targetPost.link);

    } catch (e) {
        console.log(`[CinecalidadTel] Error crítico: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
