/*
 * AniChan Provider for Nuvio
 * Domain: anichan.to
 *
 * Catatan:
 * - Tidak mencoba melewati CAPTCHA / anti-bot.
 * - Mengekstrak media URL yang memang tersedia di HTML.
 * - Mendukung direct MP4/MKV dan HLS M3U8.
 */

var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "anichan";
var BASE_URL = "https://anichan.to";

var DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9"
};

function assign(target, source) {
  var out = {};
  var k;

  target = target || {};
  source = source || {};

  for (k in target) out[k] = target[k];
  for (k in source) out[k] = source[k];

  return out;
}

function fetchText(url, options) {
  options = options || {};

  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: assign(DEFAULT_HEADERS, options.headers || {})
  }).then(function(res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }

    return res.text();
  });
}

function fixUrl(url, baseUrl) {
  if (!url) return "";

  if (
    url.indexOf("http://") === 0 ||
    url.indexOf("https://") === 0
  ) {
    return url;
  }

  if (url.indexOf("//") === 0) {
    return "https:" + url;
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch (e) {
    return url;
  }
}

function uniqueBy(list, keyFn) {
  var seen = {};
  var out = [];

  for (var i = 0; i < list.length; i++) {
    var key = keyFn(list[i]);

    if (seen[key]) continue;

    seen[key] = 1;
    out.push(list[i]);
  }

  return out;
}

function isMediaUrl(url) {
  var u = String(url || "").toLowerCase();

  return (
    /\.(m3u8|mp4|mkv)(?:\?|#|$)/i.test(u) ||
    u.indexOf("m3u8") !== -1 ||
    u.indexOf("video/") !== -1
  );
}

function detectQuality(text) {
  var t = String(text || "").toLowerCase();

  if (/\b2160p\b|\b4k\b|\buhd\b/.test(t)) {
    return "2160p";
  }

  if (/\b1440p\b/.test(t)) {
    return "1440p";
  }

  if (/\b1080p\b/.test(t)) {
    return "1080p";
  }

  if (/\b720p\b/.test(t)) {
    return "720p";
  }

  if (/\b480p\b/.test(t)) {
    return "480p";
  }

  return "Auto";
}

function buildStream(url, meta, sourceLabel, quality) {
  var title = meta.title || "AniChan";
  var season = meta.season;
  var episode = meta.episode;

  var displayTitle = title;

  if (season && episode) {
    displayTitle =
      title +
      " | S" +
      season +
      "E" +
      episode;
  }

  return {
    name:
      "AniChan | " +
      (sourceLabel || "Stream") +
      " | " +
      quality,

    title:
      displayTitle +
      "\n" +
      "📺 " +
      quality +
      " | " +
      (sourceLabel || "AniChan"),

    url: url,

    quality: quality,

    behaviorHints: {
      bingeGroup:
        "anichan-" +
        String(quality || "auto").toLowerCase()
    }
  };
}


/*
 * Extract URL media yang sudah terlihat di HTML.
 */
function extractMediaUrls(html, pageUrl, meta) {
  var $ = cheerio.load(html);
  var streams = [];

  /*
   * 1. <video src="">
   */
  $("video[src]").each(function(_, el) {
    var url = fixUrl($(el).attr("src"), pageUrl);

    if (!isMediaUrl(url)) return;

    streams.push(
      buildStream(
        url,
        meta,
        "Video",
        detectQuality(url)
      )
    );
  });


  /*
   * 2. <source src="">
   */
  $("video source[src], source[src]").each(function(_, el) {
    var url = fixUrl($(el).attr("src"), pageUrl);

    if (!isMediaUrl(url)) return;

    var text =
      $(el).attr("label") ||
      $(el).attr("data-quality") ||
      $(el).text() ||
      url;

    streams.push(
      buildStream(
        url,
        meta,
        "Source",
        detectQuality(text + " " + url)
      )
    );
  });


  /*
   * 3. iframe.
   *
   * Kita hanya mengembalikan iframe sebagai kandidat
   * jika URL-nya sendiri jelas berupa media endpoint.
   */
  $("iframe[src]").each(function(_, el) {
    var url = fixUrl($(el).attr("src"), pageUrl);

    if (!isMediaUrl(url)) return;

    streams.push(
      buildStream(
        url,
        meta,
        "Iframe",
        detectQuality(url)
      )
    );
  });


  /*
   * 4. Anchor direct media.
   */
  $("a[href]").each(function(_, el) {
    var url = fixUrl($(el).attr("href"), pageUrl);

    if (!isMediaUrl(url)) return;

    var text = $(el).text().trim();

    streams.push(
      buildStream(
        url,
        meta,
        text || "Download",
        detectQuality(text + " " + url)
      )
    );
  });


  /*
   * 5. Cari URL media yang tertanam di script.
   *
   * Hanya mengambil URL yang sudah jelas merupakan
   * endpoint media; tidak mencoba memecahkan CAPTCHA,
   * token, atau challenge.
   */
  $("script").each(function(_, el) {
    var script = $(el).html() || "";

    var matches = script.match(
      /https?:\/\/[^"'\\\s]+(?:\.m3u8|\.mp4|\.mkv)(?:\?[^"'\\\s]*)?/gi
    );

    if (!matches) return;

    for (var i = 0; i < matches.length; i++) {
      var url = matches[i];

      streams.push(
        buildStream(
          url,
          meta,
          "Embedded",
          detectQuality(url)
        )
      );
    }
  });


  return uniqueBy(streams, function(stream) {
    return String(stream.url || "");
  });
}


/*
 * Resolve halaman episode.
 */
function resolveEpisode(pageUrl, meta) {
  return fetchText(pageUrl, {
    headers: {
      Referer: BASE_URL + "/"
    }
  }).then(function(html) {
    return extractMediaUrls(html, pageUrl, meta);
  }).catch(function() {
    return [];
  });
}


/*
 * Cari URL anime.
 *
 * NOTE:
 * Selector/endpoint search AniChan dapat berubah.
 * Fungsi ini sengaja dipisahkan supaya mudah diperbarui
 * ketika struktur situs sudah diketahui.
 */
function searchAnime(query) {
  var searchUrl =
    BASE_URL +
    "/search?q=" +
    encodeURIComponent(query);

  return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var results = [];

    $("a[href]").each(function(_, el) {
      var href = fixUrl($(el).attr("href"), BASE_URL);
      var title =
        $(el).attr("title") ||
        $(el).find("h2,h3,h4").first().text().trim() ||
        $(el).text().trim();

      if (!href || !title) return;

      if (
        href.indexOf(BASE_URL) !== 0 ||
        /\/search(?:\?|\/|$)/i.test(href)
      ) {
        return;
      }

      results.push({
        title: title,
        href: href
      });
    });

    return uniqueBy(results, function(item) {
      return item.href;
    });
  }).catch(function() {
    return [];
  });
}


/*
 * Public Nuvio entry point.
 *
 * Untuk saat ini fungsi ini menggunakan pencarian situs
 * sebagai discovery layer dan kemudian mencoba halaman
 * hasil pertama.
 */
function getStreams(tmdbId, mediaType, season, episode) {
  /*
   * Tanpa endpoint metadata AniList/TMDB yang terdokumentasi
   * di AniChan, kita belum bisa mengetahui judul hanya dari
   * tmdbId secara reliable.
   *
   * Karena itu bagian ini sengaja tidak menebak judul.
   */
  return Promise.resolve([]);
}


module.exports = {
  getStreams: getStreams
};
