(async () => {
  const statusEl = document.getElementById('status');
  const metaEl = document.getElementById('meta');
  const previewEl = document.getElementById('preview');
  try {
    const data = await window.presage.getTimeline();
    if (data && data.error) {
      statusEl.textContent = 'error: ' + data.error;
      statusEl.className = 'error';
      previewEl.textContent = JSON.stringify(data, null, 2);
      return;
    }
    statusEl.textContent = 'loaded';
    const samples = data.samples || [];
    const rates = data.rates || [];
    metaEl.innerHTML =
      '<div class="row"><span class="label">videoPath</span><span class="value">' + (data.videoPath || '?') + '</span></div>' +
      '<div class="row"><span class="label">sdkVersion</span><span class="value">' + (data.sdkVersion || '?') + '</span></div>' +
      '<div class="row"><span class="label">durationMs</span><span class="value">' + (data.durationMs || 0) + '</span></div>' +
      '<div class="row"><span class="label">samples</span><span class="value">' + samples.length + '</span></div>' +
      '<div class="row"><span class="label">rates</span><span class="value">' + rates.length + '</span></div>';
    previewEl.textContent = JSON.stringify(samples.slice(0, 10), null, 2);
  } catch (err) {
    statusEl.textContent = 'exception: ' + err.message;
    statusEl.className = 'error';
  }
})();
