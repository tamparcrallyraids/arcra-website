(function () {
  'use strict';
  const feedUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRoLIbcY33960mPLrBytbpDm3Pf2eVOJBldWl14r8XuF5DhQg-Vy1XK1r6TFXsg3-DNzmFtjawvtJOL/pub?gid=904049941&single=true&output=csv';

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(field); field = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function youtubeLink(value) {
    try {
      const url = new URL(String(value).trim());
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      const host = url.hostname.toLowerCase();
      const isYoutube = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host);
      if (!isYoutube && host !== 'youtu.be') return null;
      const parts = url.pathname.split('/').filter(Boolean);
      const playlist = url.searchParams.get('list');
      if (isYoutube && ['playlist', 'watch'].includes(parts[0]) && playlist && /^[A-Za-z0-9_-]{10,150}$/.test(playlist)) {
        return { kind: 'Playlist', url: 'https://www.youtube.com/playlist?list=' + playlist };
      }
      const video = host === 'youtu.be' ? parts[0] : parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : null;
      if (!video || !/^[A-Za-z0-9_-]{11}$/.test(video)) return null;
      return { kind: 'Video', url: 'https://www.youtube.com/watch?v=' + video, thumbnail: 'https://i.ytimg.com/vi/' + video + '/hqdefault.jpg' };
    } catch (_) { return null; }
  }

  function entriesFromCSV(csv) {
    const rows = parseCSV(csv);
    if (!rows[0] || rows[0][0].replace(/^\uFEFF/, '') !== 'Event name' || rows[0][1] !== 'YouTube video or playlist link') throw new Error('Unexpected feed format');
    const seen = new Set();
    return rows.slice(1).reverse().flatMap(row => {
      const link = youtubeLink(row[1]);
      const title = (row[0] || '').trim().slice(0, 200);
      if (!title || !link || seen.has(link.url)) return [];
      seen.add(link.url);
      return [{ title, ...link }];
    });
  }

  // Pure parsing helpers are exported only when running the local validation checks.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseCSV, youtubeLink, entriesFromCSV };
    return;
  }

  const gallery = document.getElementById('videoGallery');
  const status = document.getElementById('videoFeedStatus');
  const refresh = document.getElementById('refreshVideos');
  let loading = false, previous = null;

  function render(entries) {
    const fragment = document.createDocumentFragment();
    entries.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'video-card';
      if (entry.thumbnail) {
        const image = document.createElement('img');
        image.src = entry.thumbnail;
        image.alt = '';
        image.loading = 'lazy';
        image.width = 480; image.height = 270;
        card.append(image);
      } else {
        const artwork = document.createElement('div');
        artwork.className = 'video-playlist-art';
        artwork.textContent = 'YOUTUBE PLAYLIST';
        card.append(artwork);
      }
      const content = document.createElement('div');
      content.className = 'video-card-content';
      const heading = document.createElement('h3');
      heading.textContent = entry.title;
      const link = document.createElement('a');
      link.className = 'button';
      link.href = entry.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Watch ' + entry.kind;
      content.append(heading, link); card.append(content); fragment.append(card);
    });
    gallery.replaceChildren(fragment);
  }

  async function refreshFeed() {
    if (loading || document.hidden) return;
    loading = true; refresh.disabled = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await fetch(feedUrl, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!result.ok) throw new Error('Feed unavailable');
      const entries = entriesFromCSV(await result.text());
      const signature = JSON.stringify(entries);
      if (signature !== previous) { render(entries); previous = signature; }
      status.textContent = entries.length ? entries.length + (entries.length === 1 ? ' video or playlist shared.' : ' videos and playlists shared.') : 'No videos posted yet. Be the first to share footage from a past RC event!';
    } catch (_) {
      status.textContent = previous === null ? 'The video gallery could not load right now. Try Refresh videos. You can still submit a link below.' : 'Showing the last loaded videos. The next refresh will check for new submissions.';
    } finally {
      clearTimeout(timeout); loading = false; refresh.disabled = false;
    }
  }

  refresh.addEventListener('click', refreshFeed);
  document.getElementById('videoSubmissionFrame').addEventListener('load', refreshFeed);
  document.addEventListener('visibilitychange', refreshFeed);
  window.addEventListener('focus', refreshFeed);
  refreshFeed();
  setInterval(refreshFeed, 30000);
})();
