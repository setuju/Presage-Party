'use strict';

(function () {
  const screens = {
    consent: document.getElementById('screen-consent'),
    player:  document.getElementById('screen-player'),
    stopped: document.getElementById('screen-stopped'),
  };
  const video   = document.getElementById('video');
  const timeEl  = document.getElementById('time');
  const mBr     = document.getElementById('m-br');
  const mRate   = document.getElementById('m-rate');
  const mBlink  = document.getElementById('m-blink');
  const mTalk   = document.getElementById('m-talk');
  const mStable = document.getElementById('m-stable');

  let timeline = null;
  let videoUrl = null;
  let cursor = 0;
  let rafId = 0;

  function show(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('active', k === name));
  }

  function findRate(tMs) {
    if (!timeline || !timeline.rates) return null;
    const rates = timeline.rates;
    let best = null;
    for (let i = 0; i < rates.length; i++) {
      if (rates[i].t <= tMs) best = rates[i];
      else break;
    }
    return best;
  }

  function renderFrame() {
    if (!timeline) return;
    const tMs = Math.round(video.currentTime * 1000);
    const samples = timeline.samples || [];

    // Advance cursor, tolerate duplicate t values
    while (cursor + 1 < samples.length && samples[cursor + 1].t <= tMs) cursor++;

    const s = samples[cursor];
    if (s) {
      mBr.textContent = s.br.toFixed(4);
      mBlink.textContent = s.blink ? 'yes' : 'no';
      mBlink.className = 'v' + (s.blink ? ' warn' : '');
      mTalk.textContent = s.talk ? 'yes' : 'no';
      mTalk.className = 'v' + (s.talk ? ' warn' : '');
    }

    const r = findRate(tMs);
    if (r) {
      mRate.textContent = r.value.toFixed(1) + ' bpm';
      if (typeof r.confidence === 'number') mRate.textContent += ' (' + r.confidence.toFixed(0) + '%)';
      mStable.textContent = r.stable ? 'yes' : 'no';
      mStable.className = 'v' + (r.stable ? '' : ' warn');
    }

    timeEl.textContent = video.currentTime.toFixed(1) + ' / ' + (video.duration || 0).toFixed(1) + ' s';

    if (!video.paused && !video.ended) rafId = requestAnimationFrame(renderFrame);
  }

  function resetMetrics() {
    mBr.textContent = '—';
    mRate.textContent = '—';
    mBlink.textContent = '—';
    mTalk.textContent = '—';
    mStable.textContent = '—';
    timeEl.textContent = '0.0 / 0.0 s';
    [mBr, mRate, mBlink, mTalk, mStable].forEach(el => { el.className = 'v'; });
  }

  async function startPlayback() {
    show('player');
    resetMetrics();
    cursor = 0;

    if (!timeline) {
      const result = await window.presage.getTimeline();
      if (result && result.error) {
        alert('Timeline load error: ' + result.error);
        show('consent');
        return;
      }
      timeline = result;
    }
    if (!videoUrl) {
      videoUrl = await window.presage.getVideoUrl();
      video.src = videoUrl;
    } else if (video.src !== videoUrl) {
      video.src = videoUrl;
    }

    try {
      video.currentTime = 0;
      await video.play();
    } catch (err) {
      alert('Video play error: ' + err.message);
      show('consent');
      return;
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderFrame);
  }

  function stopAndDelete() {
    cancelAnimationFrame(rafId);
    video.pause();
    video.removeAttribute('src');
    video.load();
    resetMetrics();
    cursor = 0;
    show('stopped');
  }

  function restart() {
    show('consent');
    resetMetrics();
  }

  document.getElementById('btn-allow').addEventListener('click', startPlayback);
  document.getElementById('btn-cancel').addEventListener('click', () => {
    show('consent');
  });
  document.getElementById('btn-stop').addEventListener('click', stopAndDelete);
  document.getElementById('btn-restart').addEventListener('click', restart);

  video.addEventListener('play', () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(renderFrame);
  });
  video.addEventListener('pause', () => {
    cancelAnimationFrame(rafId);
  });
  video.addEventListener('ended', () => {
    cancelAnimationFrame(rafId);
    show('stopped');
  });

  show('consent');
})();
