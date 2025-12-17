// demo5.js

function playCustomPattern() {
  const input = document.getElementById('patternInput').value;

  // Allow either comma-separated list: 250,100,250
  // or JSON-style array: [250, 100, 250]
  let pattern;

  try {
    if (input.trim().startsWith('[')) {
      pattern = JSON.parse(input);
    } else {
      pattern = input
        .split(',')
        .map(v => parseInt(v.trim(), 10))
        .filter(v => !Number.isNaN(v));
    }
  } catch (e) {
    alert('Could not parse pattern. Use comma-separated numbers or a JSON array.');
    return;
  }

  if (!Array.isArray(pattern) || pattern.length === 0) {
    alert('Please enter at least one duration in milliseconds.');
    return;
  }

  if (!navigator.vibrate) {
    alert('Vibration API is not supported on this device/browser.');
    return;
  }

  navigator.vibrate(pattern);
}

function stopVibrations() {
  if (!navigator.vibrate) return;
  navigator.vibrate(0);
}
