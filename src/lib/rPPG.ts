// Lightweight Cooley-Tukey Radix-2 FFT
function fft(re: Float32Array, im: Float32Array) {
  const N = re.length;
  for (let i = 0; i < N; i++) {
    let j = 0;
    for (let k = 0, n = i; k < Math.log2(N); k++) {
      j = (j << 1) | (n & 1);
      n >>= 1;
    }
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const tablestep = N / size;
    for (let i = 0; i < N; i += size) {
      for (let j = i, k = 0; j < i + halfSize; j++, k += tablestep) {
        const angle = (-2 * Math.PI * k) / N;
        const tRe = Math.cos(angle) * re[j + halfSize] - Math.sin(angle) * im[j + halfSize];
        const tIm = Math.sin(angle) * re[j + halfSize] + Math.cos(angle) * im[j + halfSize];
        re[j + halfSize] = re[j] - tRe;
        im[j + halfSize] = im[j] - tIm;
        re[j] += tRe;
        im[j] += tIm;
      }
    }
  }
}

function getMean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getStdDev(arr: number[], mean: number): number {
  return Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / arr.length);
}

export function calculateBPM(rBuf: number[], gBuf: number[], bBuf: number[], fps: number): number {
  const N = rBuf.length; // Must be 256 for this Radix-2 implementation

  // 1. Detrending (Remove mean)
  const rMean = getMean(rBuf);
  const gMean = getMean(gBuf);
  const bMean = getMean(bBuf);

  const rNorm = rBuf.map(val => val - rMean);
  const gNorm = gBuf.map(val => val - gMean);
  const bNorm = bBuf.map(val => val - bMean);

  // 2. CHROM Algorithm (X and Y projections)
  const X = new Array(N);
  const Y = new Array(N);
  for (let i = 0; i < N; i++) {
    X[i] = 3 * rNorm[i] - 2 * gNorm[i];
    Y[i] = 1.5 * rNorm[i] + gNorm[i] - 1.5 * bNorm[i];
  }

  const stdX = getStdDev(X, getMean(X));
  const stdY = getStdDev(Y, getMean(Y));
  const alpha = stdX / (stdY + 1e-8); // Prevent division by zero

  // 3. Calculate Signal & Apply Hann Window (Smooths the edges)
  const S = new Float32Array(N);
  const im = new Float32Array(N).fill(0);
  
  for (let i = 0; i < N; i++) {
    const rawS = X[i] - alpha * Y[i];
    // Hann Window formula
    const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
    S[i] = rawS * multiplier;
  }

  // 4. Fast Fourier Transform
  fft(S, im);

  // 5. Find peak frequency in human HR range
  // 0.75 Hz = 45 BPM | 3.5 Hz = 210 BPM
  let maxAmp = 0;
  let peakFreq = 0;

  for (let i = 0; i < N / 2; i++) {
    const freq = (i * fps) / N;
    if (freq >= 0.75 && freq <= 3.5) {
      const amplitude = Math.sqrt(S[i] * S[i] + im[i] * im[i]);
      if (amplitude > maxAmp) {
        maxAmp = amplitude;
        peakFreq = freq;
      }
    }
  }

  return Math.round(peakFreq * 60);
}