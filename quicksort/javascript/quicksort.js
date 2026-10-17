'use strict';

/**
 * Sorts an array of numbers in place (ascending) using quicksort
 * with Lomuto partitioning and a median-of-three pivot.
 * Recurses on the smaller partition and loops on the larger to bound stack depth.
 *
 * @param {number[]} arr - The array to sort; it is modified in place.
 * @param {number} [lo=0] - Start index (inclusive).
 * @param {number} [hi=arr.length - 1] - End index (inclusive).
 * @returns {number[]} The same array, sorted.
 */
function quicksort(arr, lo = 0, hi = arr.length - 1) {
  while (lo < hi) {
    const p = partition(arr, lo, hi);
    if (p - lo < hi - p) {
      quicksort(arr, lo, p - 1);
      lo = p + 1;
    } else {
      quicksort(arr, p + 1, hi);
      hi = p - 1;
    }
  }
  return arr;
}

function swap(arr, i, j) {
  const t = arr[i];
  arr[i] = arr[j];
  arr[j] = t;
}

function partition(arr, lo, hi) {
  // Median-of-three: place the median of lo/mid/hi at hi to use as pivot.
  const mid = lo + ((hi - lo) >> 1);
  if (arr[mid] < arr[lo]) swap(arr, mid, lo);
  if (arr[hi] < arr[lo]) swap(arr, hi, lo);
  if (arr[mid] < arr[hi]) swap(arr, mid, hi);
  const pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j] < pivot) {
      swap(arr, i, j);
      i++;
    }
  }
  swap(arr, i, hi);
  return i;
}

module.exports = { quicksort };

if (require.main === module) {
  const sample = [38, 27, 43, 3, 9, 82, 10, 3, -5, 0];
  console.log('Before:', JSON.stringify(sample));
  quicksort(sample);
  console.log('After: ', JSON.stringify(sample));

  const randInt = (n) => Math.floor(Math.random() * n);
  const cases = [[], [42], [5, 5, 5, 5], [2, 1], [1, 2, 3, 4, 5], [5, 4, 3, 2, 1]];
  while (cases.length < 100) {
    const len = randInt(50);
    const range = randInt(2) ? 10 : 1000; // small range forces many duplicates
    cases.push(Array.from({ length: len }, () => randInt(range) - range / 2));
  }

  let failures = 0;
  for (const a of cases) {
    const expected = [...a].sort((x, y) => x - y);
    const actual = quicksort([...a]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures++;
      console.error('FAIL:', JSON.stringify(a), '->', JSON.stringify(actual));
    }
  }
  console.log(`Self-check: ${cases.length - failures}/${cases.length} passed`);
  process.exitCode = failures ? 1 : 0;
}
