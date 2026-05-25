/**
 * SoloLatino Provider for NuvioSniffer
 * Self-contained provider with inline embed resolvers.
 * No WebView needed - resolves everything server-side.
 */

// == Configuration ==
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const HOST = "https://player.pelisserieshoy.com";
const REFERER_BASE = "https://sololatino.net/";

// CryptoJS detection (global in QuickJS, require in Node)
let CryptoJS = globalThis.CryptoJS;
if (typeof CryptoJS === "undefined" && typeof require === "function") {
    try { CryptoJS = require("crypto-js"); } catch (e) {}
}

// == Utility functions ==
function safeAtob(input) {
    if (!input) return "";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let str = String(input).replace(/=+$/, "").replace(/[\s\n\r\t]/g, "");
    let output = "";
    if (str.length % 4 === 1) return "";
    for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    return output;
}

function unpackPacker(packed) {
    try {
        const match = packed.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
        if (!match) return null;
        let [, p, a, c, k] = match;
        a = parseInt(a);
        c = parseInt(c);
        k = k.split("|");
        const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const unbase = (str) => {
            let result = 0;
            for (let i = 0; i < str.length; i++) result = result * a + chars.indexOf(str[i]);
            return result;
        };
        return p.replace(/\b([0-9a-zA-Z]+)\b/g, (match) => {
            const idx = unbase(match);
            return (idx >= 0 && idx < k.length && k[idx] !== "") ? k[idx] : match;
        });
    } catch (e) {
        return null;
    }
}

function getQualityFromHeight(height) {
    if (!height) return "1080p";
    const h = parseInt(height);
    if (h >= 2160) return "4K";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    if (h >= 360) return "360p";
    return "1080p";
}

function parseBestQuality(content, url) {
    let bestHeight = 0;
    if (content && content.includes("#EXT-X-STREAM-INF")) {
        const lines = content.split("\n");
        for (const line of lines) {
            const match = line.match(/RESOLUTION=\d+x(\d+)/i);
            if (match) {
                const h = parseInt(match[1]);
                if (h > bestHeight) bestHeight = h;
            }
        }
    }
    let quality = "1080p";
    let isReal = false;
    if (bestHeight > 0) {
        quality = getQualityFromHeight(bestHeight);
        isReal = true;
    } else if (url) {
        const qMatch = url.match(/[_-](\d{3,4})p/i);
        if (qMatch) quality = qMatch[1] + "p";
    }
    return { quality, isReal };
}

// == Resolvers ==

// VOE resolver (also covers cloudwindow-route, marissashare, etc.)
async function resolveVoe(url) {
    try {
        console.log(`[VOE] Resolviendo: ${url}`);
        const response = await fetch(url, { headers: { "User-Agent": UA } });
        if (!response.ok) return null;
        const html = await response.text();

        const jsonMatch = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1].trim());
                let encText = Array.isArray(parsed) ? parsed[0] : parsed;
                if (typeof encText !== "string") return null;

                let decoded = encText.replace(/[a-zA-Z]/g, (c) => {
                    const code = c.charCodeAt(0);
                    const limit = c <= "Z" ? 90 : 122;
                    const shifted = code + 13;
                    return String.fromCharCode(limit >= shifted ? shifted : shifted - 26);
                });
                const noise = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
                for (const n of noise) decoded = decoded.split(n).join("");

                const b64_1 = safeAtob(decoded);
                if (!b64_1) throw new Error("atob failed stage 1");

                let shiftedStr = "";
                for (let j = 0; j < b64_1.length; j++) {
                    shiftedStr += String.fromCharCode(b64_1.charCodeAt(j) - 3);
                }
                const reversed = shiftedStr.split("").reverse().join("");
                const decrypted = safeAtob(reversed);
                if (!decrypted) throw new Error("atob failed stage 2");

                const data = JSON.parse(decrypted);
                if (data && data.source) {
                    return {
                        url: data.source,
                        quality: "1080p",
                        verified: true,
                        serverName: "VOE",
                        headers: { "User-Agent": UA, "Referer": url }
                    };
                }
            } catch (ex) {
                console.log(`[VOE] Decryption error: ${ex.message}`);
            }
        }

        const m3u8Match = html.match(/["'](https?:\/\/[^"']+?\.m3u8[^"']*?)["']/i);
        if (m3u8Match) {
            return {
                url: m3u8Match[1],
                quality: "1080p",
                verified: true,
                serverName: "VOE",
                headers: { "User-Agent": UA, "Referer": url }
            };
        }
        return null;
    } catch (e) {
        console.log(`[VOE] Error: ${e.message}`);
        return null;
    }
}

// VidHide resolver (covers minochinos, masukestin, mdfury, etc.)
async function resolveVidHide(url) {
    try {
        console.log(`[VidHide] Resolviendo: ${url}`);
        const response = await fetch(url, { headers: { "User-Agent": UA, "Referer": new URL(url).origin + "/" } });
        if (!response.ok) return null;
        const html = await response.text();

        let finalUrl = null;
        const packedMatch = html.match(/eval\(function\(p,a,c,k,e,[rd]\)[\s\S]*?\.split\('\|'\)[^\)]*\)\)/);
        if (packedMatch) {
            const unpacked = unpackPacker(packedMatch[0]);
            if (unpacked) {
                const hlsMatch = unpacked.match(/"hls[24]"\s*:\s*"([^"]+)"/);
                if (hlsMatch) finalUrl = hlsMatch[1];
            }
        }

        if (!finalUrl) {
            const rawMatch = html.match(/"hls[24]"\s*:\s*"([^"]+)"/) || html.match(/file\s*:\s*["']([^"']+)["']/i) || html.match(/["'](https?:\/\/[^"']+?\.m3u8[^"']*?)["']/i);
            if (rawMatch) finalUrl = rawMatch[1];
        }

        if (!finalUrl) return null;
        if (!finalUrl.startsWith("http")) finalUrl = new URL(url).origin + finalUrl;

        return {
            url: finalUrl,
            quality: "1080p",
            verified: true,
            serverName: "VidHide",
            headers: { "User-Agent": UA, "Referer": url.split("?")[0], "Origin": new URL(url).origin }
        };
    } catch (e) {
        console.log(`[VidHide] Error: ${e.message}`);
        return null;
    }
}

// Filemoon resolver (covers r66nv9ed, filemoon.sx, etc.) - uses CryptoJS for AES-GCM
async function resolveFilemoon(url) {
    try {
        console.log(`[Filemoon] Resolviendo: ${url}`);
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        const videoId = urlObj.pathname.split("/").filter(p => !!p).pop();
        if (!videoId) return null;

        const detailsResp = await fetch(`https://${hostname}/api/videos/${videoId}/embed/details`, {
            headers: { "X-Requested-With": "XMLHttpRequest", "Referer": url, "User-Agent": UA }
        });
        if (!detailsResp.ok) {
            // Fallback: try extracting from HTML directly
            const htmlResp = await fetch(url, { headers: { "User-Agent": UA, "Referer": "https://sololatino.net/" } });
            if (!htmlResp.ok) return null;
            const html = await htmlResp.text();
            const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
            if (m3u8Match) {
                return {
                    url: m3u8Match[0],
                    quality: "1080p",
                    verified: true,
                    serverName: "Filemoon",
                    headers: { "User-Agent": UA, "Referer": url }
                };
            }
            return null;
        }
        const details = await detailsResp.json();
        const frameUrl = details.embed_frame_url;
        if (!frameUrl) return null;

        const playbackDomain = new URL(frameUrl).origin;

        // Challenge
        const challengeResp = await fetch(`${playbackDomain}/api/videos/access/challenge`, {
            method: "POST",
            headers: { "X-Requested-With": "XMLHttpRequest", "Referer": frameUrl, "Origin": playbackDomain, "User-Agent": UA }
        });
        const challenge = await challengeResp.json();
        if (!challenge.challenge_id) return null;

        // Attest
        const deviceId = Math.random().toString(36).substring(2, 15);
        const viewerId = Math.random().toString(36).substring(2, 15);
        const attestPayload = {
            viewer_id: viewerId,
            device_id: deviceId,
            challenge_id: challenge.challenge_id,
            nonce: challenge.nonce,
            signature: "MEUCIQDYi5fX9gG8_5t_4v8p_Q8o8l5v8v8v8v8v8v8v8v8v",
            public_key: {
                kty: "EC", crv: "P-256",
                x: "thRcTF9d89tZ704lTYciJq48dtIaoqf9L0Is1gK29II",
                y: "v8Oo5z9N9406uE4RnU3dlmpbAaMQtt61uynn6kgz4_Q"
            },
            client: { user_agent: UA, platform: "Windows", languages: ["es-ES"] },
            storage: { cookie: viewerId, local_storage: viewerId },
            attributes: { entropy: "high" }
        };
        const attestResp = await fetch(`${playbackDomain}/api/videos/access/attest`, {
            method: "POST",
            body: JSON.stringify(attestPayload),
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": frameUrl,
                "Origin": playbackDomain,
                "User-Agent": UA
            }
        });
        const attestData = await attestResp.json();
        if (!attestData.token) return null;

        // Playback
        const playbackPayload = {
            fingerprint: {
                token: attestData.token,
                viewer_id: attestData.viewer_id || viewerId,
                device_id: attestData.device_id || deviceId,
                confidence: attestData.confidence
            }
        };
        const playResp = await fetch(`${playbackDomain}/api/videos/${videoId}/embed/playback`, {
            method: "POST",
            body: JSON.stringify(playbackPayload),
            headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": frameUrl,
                "Origin": playbackDomain,
                "X-Embed-Parent": url,
                "User-Agent": UA
            }
        });
        const playData = await playResp.json();
        if (playData.playback && CryptoJS) {
            const decrypted = decryptByse(playData.playback);
            if (decrypted) {
                const data = JSON.parse(decrypted);
                const directUrl = (data.sources && data.sources[0] && data.sources[0].url) || data.url;
                if (directUrl) {
                    return {
                        url: directUrl,
                        quality: (data.sources && data.sources[0] && data.sources[0].label) || "HD",
                        verified: true,
                        serverName: "Filemoon",
                        headers: { "User-Agent": UA, "Referer": playbackDomain, "Origin": playbackDomain }
                    };
                }
            }
        }
        return null;
    } catch (e) {
        console.log(`[Filemoon] Error: ${e.message}`);
        return null;
    }
}

// AES-GCM decryption for Filemoon (requires CryptoJS)
function decryptByse(playback) {
    try {
        if (!playback || !playback.key_parts || !playback.payload || !playback.iv || !CryptoJS) return null;

        function parseB64(b64) {
            if (!b64) return null;
            try {
                const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
                return CryptoJS.enc.Base64.parse(normalized);
            } catch (e) { return null; }
        }

        let keyWA = parseB64(playback.key_parts[0]);
        for (let i = 1; i < playback.key_parts.length; i++) {
            const part = parseB64(playback.key_parts[i]);
            if (part) keyWA = keyWA.concat(part);
        }
        const ivWA = parseB64(playback.iv);
        const ciphertextWithTagWA = parseB64(playback.payload);
        if (!keyWA || !ivWA || !ciphertextWithTagWA) return null;

        const ciphertextWords = ciphertextWithTagWA.words.slice(0, ciphertextWithTagWA.words.length - 4);
        const ciphertextWA = CryptoJS.lib.WordArray.create(ciphertextWords, ciphertextWithTagWA.sigBytes - 16);
        let counterWA = ivWA.clone();
        counterWA.concat(CryptoJS.lib.WordArray.create([2], 4));

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: ciphertextWA },
            keyWA,
            { iv: counterWA, mode: CryptoJS.mode.CTR, padding: CryptoJS.pad.NoPadding }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.log(`[AES-GCM] Error: ${e.message}`);
        return null;
    }
}

// StreamWish resolver (covers hlswish, streamwish, etc.)
async function resolveStreamWish(url) {
    try {
        console.log(`[StreamWish] Resolviendo: ${url}`);
        const rawId = url.split("/").pop().replace(/\.html$/, "");
        const urlObj = new URL(url);
        const mirrors = [
            `https://hanerix.com/e/${rawId}`,
            `https://embedwish.com/e/${rawId}`,
            `https://hglink.to/e/${rawId}`,
            url,
            `https://streamwish.to/e/${rawId}`,
            `https://awish.pro/e/${rawId}`,
            `https://wishfast.top/e/${rawId}`
        ];

        for (const mirror of mirrors) {
            try {
                const mirrorObj = new URL(mirror);
                const mirrorOrigin = mirrorObj.origin;
                const resp = await fetch(mirror, { headers: { "Referer": mirror, "User-Agent": UA } });
                if (!resp.ok) continue;
                const html = await resp.text();

                let m3u8Url = null;
                const hashMatch = html.match(/[0-9a-f]{32}/i);
                if (hashMatch) {
                    const hash = hashMatch[0];
                    const dlUrl = `${mirrorOrigin}/dl?op=view&file_code=${rawId}&hash=${hash}&embed=1&referer=&hls4=1`;
                    const dlResp = await fetch(dlUrl, {
                        headers: { "User-Agent": UA, "Referer": mirror, "X-Requested-With": "XMLHttpRequest" }
                    });
                    if (dlResp.ok) {
                        const dlData = await dlResp.text();
                        const match = dlData.match(/https?:\/\/[^"']+\.m3u8[^"']*/);
                        if (match) m3u8Url = match[0];
                    }
                }

                if (!m3u8Url) {
                    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,[a-z]\)\{[\s\S]*?\}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
                    if (packedMatch) {
                        const unpacked = unpackPacker(packedMatch[0]);
                        if (unpacked) {
                            const match = unpacked.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
                            if (match) m3u8Url = match[0];
                        }
                    }
                }

                if (!m3u8Url) {
                    const fileMatch = html.match(/file\s*:\s*["']([^"']+)["']/i);
                    if (fileMatch) m3u8Url = fileMatch[1];
                }

                if (m3u8Url) {
                    m3u8Url = m3u8Url.replace(/\\/g, "");
                    if (m3u8Url.startsWith("/")) m3u8Url = mirrorOrigin + m3u8Url;
                    return {
                        url: m3u8Url,
                        quality: "Auto",
                        verified: true,
                        serverName: "StreamWish",
                        headers: { "User-Agent": UA, "Referer": mirror, "Origin": mirrorOrigin }
                    };
                }
            } catch (e) {}
        }
        return null;
    } catch (e) {
        console.log(`[StreamWish] Error: ${e.message}`);
        return null;
    }
}



// Detect server name from URL domain
function detectServerFromDomain(url) {
    const low = url.toLowerCase();
    if (low.includes("minochinos") || low.includes("masukestin") || low.includes("vidhide") || low.includes("mdfury")) return "VidHide";
    if (low.includes("r66nv9ed") || low.includes("filemoon") || low.includes("398fitus") || low.includes("bysedikamoum")) return "Filemoon";
    if (low.includes("cloudwindow") || low.includes("voe") || low.includes("ericeastweight") || low.includes("marissashare")) return "VOE";
    if (low.includes("streamwish") || low.includes("hlswish") || low.includes("hglink") || low.includes("hanerix") || low.includes("filelions")) return "StreamWish";
    if (low.includes("mediafire")) return "Descarga";
    if (low.includes("p.php")) return "Player+";
    try {
        const domain = new URL(url).hostname.replace("www.", "");
        return domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
    } catch (e) {
        return "Servidor";
    }
}

// Detect quality by fetching m3u8 playlist
async function detectQuality(url) {
    try {
        if (!url || !url.toLowerCase().includes(".m3u8")) return "HD";
        const resp = await fetch(url, { headers: { "User-Agent": UA } });
        if (!resp.ok) return "HD";
        const text = await resp.text();
        if (!text.includes("#EXT-X-STREAM-INF")) {
            const qMatch = url.match(/[_-](\d{3,4})p/i);
            return qMatch ? qMatch[1] + "p" : "HD";
        }
        let maxHeight = 0;
        const lines = text.split("\n");
        for (const line of lines) {
            const m = line.match(/RESOLUTION=\d+x(\d+)/i);
            if (m) {
                const h = parseInt(m[1]);
                if (h > maxHeight) maxHeight = h;
            }
        }
        if (maxHeight >= 2160) return "4K";
        if (maxHeight >= 1080) return "1080p";
        if (maxHeight >= 720) return "720p";
        if (maxHeight >= 480) return "480p";
        return maxHeight > 0 ? maxHeight + "p" : "HD";
    } catch (e) {
        return "HD";
    }
}

function makeHeaders(refererUrl, cookie) {
    const h = {
        "User-Agent": UA,
        "Referer": refererUrl || HOST + "/",
        "Origin": refererUrl ? new URL(refererUrl).origin : HOST
    };
    if (cookie) h["Cookie"] = cookie;
    return h;
}

// Resolve any URL to a playable stream
async function resolveEmbed(url, refererUrl, cookie) {
    if (!url) return null;
    const low = url.toLowerCase();

    // p.php (Player+) - follow redirect chain
    if (low.includes("/p.php?")) {
        try {
            const pResp = await fetch(url, { headers: makeHeaders(refererUrl, cookie), redirect: "follow" });
            const finalUrl = pResp.url;
            if (finalUrl && finalUrl !== url) {
                if (finalUrl.includes("mediafire.com") || finalUrl.includes(".mp4") || finalUrl.includes(".m3u8") || finalUrl.includes("/download")) {
                    return {
                        url: finalUrl,
                        quality: "HD",
                        verified: true,
                        serverName: "Player+",
                        headers: makeHeaders(refererUrl, cookie)
                    };
                }
            }
        } catch (e) {}
        return {
            url,
            quality: "SD",
            verified: false,
            serverName: "Player+",
            headers: makeHeaders(refererUrl, cookie),
            notWebReady: true
        };
    }

    try {
        const probeResp = await fetch(url, { headers: makeHeaders(refererUrl, cookie), redirect: "follow" });
        const finalUrl = probeResp.url;
        const contentType = (probeResp.headers.get("content-type") || "").toLowerCase();

        if (contentType.includes("mpegurl") || contentType.includes("video/") || contentType.includes("octet-stream") || finalUrl.includes(".m3u8") || finalUrl.includes(".mp4")) {
            const quality = finalUrl.includes(".m3u8") ? await detectQuality(finalUrl) : "HD";
            return {
                url: finalUrl,
                quality,
                verified: true,
                isReal: true,
                serverName: detectServerFromDomain(url),
                headers: makeHeaders(refererUrl, cookie)
            };
        }

        if (finalUrl !== url) {
            const textResp = await fetch(finalUrl, { headers: makeHeaders(refererUrl, cookie), redirect: "follow" });
            if (textResp.ok) {
                const text = await textResp.text();
                const m3u8Match = text.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
                if (m3u8Match) {
                    return {
                        url: m3u8Match[0],
                        quality: "HD",
                        verified: true,
                        serverName: detectServerFromDomain(url),
                        headers: makeHeaders(refererUrl, cookie)
                    };
                }
            }
        }

        const html = await probeResp.text();
        const isVoe = low.includes("voe") || low.includes("ericeastweight") || low.includes("cloudwindow") || low.includes("marissashare");
        const isVidHide = low.includes("vidhide") || low.includes("minochinos") || low.includes("masukestin") || low.includes("vadisov") || low.includes("mdfury") || low.includes("dintezuvio") || low.includes("vidhidepro") || low.includes("vidhidevip") || low.includes("vidoza");
        const isFilemoon = low.includes("filemoon") || low.includes("r66nv9ed") || low.includes("398fitus") || low.includes("moonalu") || low.includes("moonembed") || low.includes("bysedikamoum") || low.includes("fmoon");
        const isStreamWish = low.includes("streamwish") || low.includes("hlswish") || low.includes("hglink") || low.includes("embedwish") || low.includes("awish") || low.includes("wishfast") || low.includes("filelions") || low.includes("hanerix");

        if (isVoe) { const res = await resolveVoe(url); if (res) return { ...res, headers: makeHeaders(refererUrl, cookie) }; }
        if (isVidHide) { const res = await resolveVidHide(url); if (res) return { ...res, headers: makeHeaders(refererUrl, cookie) }; }
        if (isFilemoon) { const res = await resolveFilemoon(url); if (res) return { ...res, headers: makeHeaders(refererUrl, cookie) }; }
        if (isStreamWish) { const res = await resolveStreamWish(url); if (res) return { ...res, headers: makeHeaders(refererUrl, cookie) }; }

        const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
        if (m3u8Match) {
            return { url: m3u8Match[0], quality: "HD", verified: true, serverName: detectServerFromDomain(url), headers: makeHeaders(refererUrl, cookie) };
        }
        const mp4Match = html.match(/https?:\/\/[^"'\s"]+\.mp4[^"'\s]*/i);
        if (mp4Match) {
            return { url: mp4Match[0], quality: "HD", verified: true, serverName: detectServerFromDomain(url), headers: makeHeaders(refererUrl, cookie) };
        }
    } catch (e) {}

    return { url, quality: "SD", verified: false, serverName: detectServerFromDomain(url), headers: makeHeaders(refererUrl, cookie) };
}

// Validate stream: check m3u8 quality
async function validateStream(stream) {
    if (!stream || !stream.url) return stream;
    const { url, headers } = stream;
    try {
        const response = await fetch(url, {
            method: url.toLowerCase().includes(".mp4") ? "HEAD" : "GET",
            headers: { "User-Agent": UA, ...(headers || {}) }
        });
        if (!response.ok) return { ...stream, verified: false };

        if (url.toLowerCase().includes(".mp4")) {
            return { ...stream, verified: true, quality: stream.quality || "1080p", isReal: true };
        }

        const text = await response.text();
        const info = parseBestQuality(text, url);
        return { ...stream, verified: true, quality: info.quality, isReal: info.isReal };
    } catch (e) {
        const info = parseBestQuality("", url);
        return { ...stream, quality: info.quality, verified: true, isReal: false };
    }
}

// Sort streams by quality
function sortStreamsByQuality(streams) {
    const QUALITY_SCORE = { "4K": 100, "1440p": 90, "1080p": 80, "720p": 70, "480p": 60, "360p": 50, "Auto": 30, "HD": 25, "SD": 10 };
    const SERVER_SCORE = { "VOE": 10, "Filemoon": 10, "Vimeos": 10, "Netu": 5, "GoodStream": 10, "StreamWish": -5, "VidHide": -5 };

    if (!Array.isArray(streams)) return [];
    return [...streams].sort((a, b) => {
        const scoreA = QUALITY_SCORE[a.quality] || 0;
        const scoreB = QUALITY_SCORE[b.quality] || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;

        const serverA = (a.serverName || "").split(" ")[0];
        const serverB = (b.serverName || "").split(" ")[0];
        const speedA = SERVER_SCORE[serverA] || 0;
        const speedB = SERVER_SCORE[serverB] || 0;
        if (speedA !== speedB) return speedB - speedA;

        if (a.verified && !b.verified) return -1;
        if (!a.verified && b.verified) return 1;
        return 0;
    });
}

// Normalize server name
function normalizeServer(server, url) {
    const s = (server || "").toLowerCase();
    const u = (url || "").toLowerCase();
    if (u.includes("voe") || s.includes("voe")) return "VOE";
    if (u.includes("filemoon") || s.includes("filemoon")) return "Filemoon";
    if (u.includes("vidhide") || s.includes("vidhide")) return "VidHide";
    if (u.includes("streamwish") || s.includes("streamwish")) return "StreamWish";
    if (u.includes("cloudwindow") || s.includes("cloudwindow")) return "VOE";
    if (u.includes("minochinos") || s.includes("minochinos")) return "VidHide";
    if (u.includes("masukestin") || s.includes("masukestin")) return "VidHide";
    if (u.includes("r66nv9ed") || s.includes("r66nv9ed")) return "Filemoon";
    if (u.includes("mediafire")) return "Descarga";
    return server || "Servidor";
}

// Finalize streams: sort, dedupe, enrich
async function finalizeStreams(streams, providerName) {
    if (!Array.isArray(streams) || streams.length === 0) return [];
    const sorted = sortStreamsByQuality(streams);

    const validated = [];
    for (const s of sorted) {
        if (s.isReal === true) { validated.push(s); continue; }
        if (s.url && (s.url.includes(".m3u8") || s.url.includes(".mp4"))) {
            try {
                const result = await validateStream(s);
                validated.push(result);
            } catch (e) {
                validated.push({ ...s, verified: false, isReal: false });
            }
        } else {
            validated.push(s);
        }
    }

    const processed = [];
    const seenUrls = new Set();
    for (const s of validated) {
        if (!s || !s.url) continue;
        if (seenUrls.has(s.url)) continue;
        seenUrls.add(s.url);

        const server = normalizeServer(s.serverName, s.url);
        const quality = s.quality || "HD";
        const checkMark = s.isReal ? " ✅" : "";
        const streamName = `${providerName} - ${quality}${checkMark}`;

        processed.push({
            name: streamName,
            title: `${s.langLabel || "Latino"} - ${server}`,
            url: s.url,
            quality,
            verified: s.verified || false,
            isReal: s.isReal || false,
            provider: server,
            language: s.langLabel || "Latino",
            headers: s.headers || { "User-Agent": UA }
        });
    }
    return processed;
}

// == IMDB ID resolver ==
async function getImdbId(tmdbId, mediaType) {
    try {
        const type = String(mediaType || "").toLowerCase().includes("movie") ? "movie" : "tv";
        const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) return null;
        const data = await res.json();
        return data ? data.imdb_id || null : null;
    } catch (e) {
        console.log(`[SoloLatino] Error IMDB: ${e.message}`);
        return null;
    }
}

// == Main function ==
async function getStreams(tmdbId, mediaType, season, episode, title) {
    try {
        let cleanId = String(tmdbId).trim();
        if (cleanId.includes("|")) cleanId = cleanId.split("|")[0];
        cleanId = cleanId.replace(/^tmdb:/, "").replace(/^series:/, "").replace(/^movie:/, "").split(":")[0].split("/")[0];
        if (!cleanId || cleanId === "null" || cleanId === "undefined") return [];

        let imdbId = cleanId.startsWith("tt") ? cleanId : null;
        if (!imdbId) imdbId = await getImdbId(cleanId, mediaType);
        if (!imdbId) return [];

        const isMovie = ["movie", "film"].includes(String(mediaType).toLowerCase());
        const ep = String(episode || 1).padStart(2, "0");
        const slug = isMovie ? imdbId : `${imdbId}-${season || 1}x${ep}`;
        const oWeb = `${HOST}/f/${slug}`;

        console.log(`[SoloLatino] Buscando: ${oWeb}`);

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
            console.log("[SoloLatino] No token");
            return [];
        }

        const commonHeaders = {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": oWeb,
            "X-Requested-With": "XMLHttpRequest"
        };
        if (cookie) commonHeaders["Cookie"] = cookie;

        // Inicialización requerida antes de a=1
        const initActions = ["dlshort_scan", "dlshort_mf", "mark_vip", "dlurl"];
        for (const action of initActions) {
            await fetch(`${HOST}/s.php`, { method: "POST", headers: commonHeaders, body: `a=${action}&tok=${token}` }).catch(() => {});
        }
        await fetch(`${HOST}/s.php`, { method: "POST", headers: commonHeaders, body: `a=click&tok=${token}` }).catch(() => {});

        const listRes = await fetch(`${HOST}/s.php`, { method: "POST", headers: commonHeaders, body: `a=1&tok=${token}` });
        const listData = await listRes.json();

        const latServers = (listData.langs_s && listData.langs_s.LAT) || listData.s || [];
        console.log(`[SoloLatino] Servidores: ${latServers.length}`);

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

                if (videoUrl.includes("/api/source/")) {
                    try {
                        const domain = new URL(videoUrl).hostname;
                        const apiRes = await fetch(videoUrl, {
                            method: "POST",
                            headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "Referer": oWeb, "origin": HOST },
                            body: `r=https%3A%2F%2Fre.sololatino.net%2F&d=${domain}`
                        });
                        const apiData = await apiRes.json();
                        if (apiData.success && apiData.data && apiData.data.length > 0) {
                            videoUrl = apiData.data[apiData.data.length - 1].file;
                        }
                    } catch (e) {}
                }

                if (!videoUrl.startsWith("http")) {
                    videoUrl = HOST + videoUrl;
                }

                // === RESOLVE EVERYTHING SERVER-SIDE ===
                console.log(`[SoloLatino] Resolviendo ${srvName}: ${videoUrl.substring(0, 80)}`);

                const resolved = await resolveEmbed(videoUrl, oWeb, cookie);
                if (resolved && resolved.url) {
                    const item = {
                        name: `SOLOLATINO - ${srvName.toUpperCase()}`,
                        title: `Latino - ${resolved.serverName || srvName}`,
                        url: resolved.url,
                        quality: resolved.quality || "HD",
                        verified: resolved.verified || false,
                        isReal: resolved.isReal || false,
                        provider: resolved.serverName || srvName,
                        language: "Latino",
                        headers: resolved.headers || makeHeaders(oWeb, cookie)
                    };
                
                    console.log(`[SoloLatino] >> ${srvName} -> ${resolved.serverName || "OK"}: ${resolved.url.substring(0, 80)}`);

                    if (typeof __yield_result === "function") {
                        __yield_result(JSON.stringify(item));
                    }
                    results.push(item);

                    if (typeof __native_sleep === "function") {
                        await __native_sleep(30);
                    }
                    await new Promise(r => setTimeout(r, 200));
                } else {
                    console.log(`[SoloLatino] ${srvName} no pudo resolverse`);
                }
            } catch (e) {
                console.log(`[SoloLatino] Error servidor: ${e.message}`);
            }
        }

        return finalizeStreams(results, "SoloLatino");
    } catch (e) {
        console.log(`[SoloLatino] Error: ${e.message}`);
        return [];
    }
}

module.exports = { getStreams };
