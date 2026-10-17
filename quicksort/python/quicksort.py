"""In-place quicksort using Hoare partitioning with a random pivot.

Average O(n log n) time, O(log n) expected stack depth (recurses on the
smaller side, loops on the larger). Sorts the list in place and returns it.
"""

import random


def _partition(a, lo, hi):
    """Hoare partition of a[lo..hi] around a random pivot; returns split index j
    such that every element of a[lo..j] <= every element of a[j+1..hi]."""
    pivot = a[random.randint(lo, hi)]
    i, j = lo - 1, hi + 1
    while True:
        i += 1
        while a[i] < pivot:
            i += 1
        j -= 1
        while a[j] > pivot:
            j -= 1
        if i >= j:
            return j
        a[i], a[j] = a[j], a[i]


def quicksort(a, lo=0, hi=None):
    """Sort list `a` in place between indices lo and hi (inclusive)."""
    if hi is None:
        hi = len(a) - 1
    while lo < hi:
        p = _partition(a, lo, hi)
        # Recurse on the smaller half to bound stack depth.
        if p - lo < hi - p:
            quicksort(a, lo, p)
            lo = p + 1
        else:
            quicksort(a, p + 1, hi)
            hi = p
    return a


if __name__ == "__main__":
    sample = [38, 27, 43, 3, 9, 82, 10, 3, -5, 27]
    print("before:", sample)
    quicksort(sample)
    print("after: ", sample)

    rng = random.Random(42)
    cases = [[], [1], [2, 2, 2, 2], [5, 4, 3, 2, 1], list(range(20))]
    while len(cases) < 100:
        n = rng.randint(0, 50)
        cases.append([rng.randint(-10, 10) for _ in range(n)])
    for arr in cases:
        expected = sorted(arr)
        got = quicksort(list(arr))
        assert got == expected, f"FAIL: {arr} -> {got}"
    print(f"self-check passed: {len(cases)} arrays")
