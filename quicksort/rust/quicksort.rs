//! Standalone generic in-place quicksort.
//! Build and run: `rustc -O quicksort.rs && ./quicksort`

use std::cmp::Ordering;

/// Sorts `v` in place in ascending order using quicksort.
///
/// Uses a median-of-three pivot and a three-way (Dijkstra) partition so
/// runs of equal keys are handled in linear time. Recurses on the smaller
/// side and loops on the larger, bounding stack depth to O(log n).
/// Not stable.
fn quicksort<T: Ord>(mut v: &mut [T]) {
    while v.len() > 1 {
        let n = v.len();

        // Median-of-three: order v[0], v[mid], v[n-1], then move the median to v[0].
        let mid = n / 2;
        if v[mid] < v[0] {
            v.swap(mid, 0);
        }
        if v[n - 1] < v[0] {
            v.swap(n - 1, 0);
        }
        if v[n - 1] < v[mid] {
            v.swap(n - 1, mid);
        }
        v.swap(0, mid);

        // Three-way partition. Invariant:
        //   v[..lt] < pivot, v[lt..i] == pivot (non-empty), v[gt..] > pivot.
        let (mut lt, mut i, mut gt) = (0, 1, n);
        while i < gt {
            match v[i].cmp(&v[lt]) {
                Ordering::Less => {
                    v.swap(lt, i);
                    lt += 1;
                    i += 1;
                }
                Ordering::Greater => {
                    gt -= 1;
                    v.swap(i, gt);
                }
                Ordering::Equal => i += 1,
            }
        }

        let (left, rest) = v.split_at_mut(lt);
        let right = &mut rest[gt - lt..];
        if left.len() < right.len() {
            quicksort(left);
            v = right;
        } else {
            quicksort(right);
            v = left;
        }
    }
}

/// Tiny xorshift64 PRNG (no external crates).
struct XorShift64(u64);

impl XorShift64 {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

fn check(v: Vec<i64>) -> bool {
    let mut got = v.clone();
    let mut want = v;
    quicksort(&mut got);
    want.sort();
    got == want
}

fn main() {
    let mut sample = [38, 27, 43, 3, 9, 82, 10, 3, -5, 27, 0];
    println!("before: {:?}", sample);
    quicksort(&mut sample);
    println!("after:  {:?}", sample);

    let mut words = ["pear", "apple", "fig", "banana", "apple"];
    quicksort(&mut words);
    println!("words:  {:?}", words);

    let mut rng = XorShift64(0x9E37_79B9_7F4A_7C15);
    let mut cases: Vec<Vec<i64>> = vec![
        vec![],                     // empty
        vec![42],                   // single element
        vec![7; 50],                // all duplicates
        (0..200).collect(),         // already sorted
        (0..200).rev().collect(),   // reverse sorted
    ];
    for _ in 0..100 {
        let len = rng.below(300) as usize;
        // Alternate between narrow ranges (many duplicates) and wide ranges.
        let range = if rng.below(2) == 0 { 5 } else { 1_000_000 };
        cases.push(
            (0..len)
                .map(|_| rng.below(range) as i64 - (range / 2) as i64)
                .collect(),
        );
    }

    let total = cases.len();
    let failures = cases.into_iter().filter(|c| !check(c.clone())).count();
    println!(
        "self-check: {}/{} cases match slice::sort",
        total - failures,
        total
    );
    if failures > 0 {
        std::process::exit(1);
    }
}
