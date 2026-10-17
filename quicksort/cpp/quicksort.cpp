// Quicksort in C++17 (standard library only).
//
// In-place quicksort over random-access iterators. Uses median-of-three pivot
// selection and Hoare-style partitioning, recursing on the smaller partition
// and looping on the larger one so stack depth stays O(log n).
// Build: g++ -std=c++17 -O2 -Wall -Wextra quicksort.cpp -o /tmp/quicksort

#include <algorithm>
#include <cstddef>
#include <functional>
#include <iostream>
#include <iterator>
#include <random>
#include <vector>

template <typename RandomIt, typename Compare = std::less<>>
void quicksort(RandomIt first, RandomIt last, Compare comp = Compare{}) {
    while (last - first > 1) {
        // Median-of-three: order *first, *mid, *(last-1), use the middle value as pivot.
        RandomIt mid = first + (last - first - 1) / 2;  // lower middle
        RandomIt back = last - 1;
        if (comp(*mid, *first)) std::iter_swap(mid, first);
        if (comp(*back, *first)) std::iter_swap(back, first);
        if (comp(*back, *mid)) std::iter_swap(back, mid);
        const auto pivot = *mid;

        // Hoare partition (index-based to avoid stepping before begin):
        // afterwards [first, first+j] <= pivot and [first+j+1, last) >= pivot.
        // With the pivot taken from the lower middle, j < n-1, so both halves
        // are non-empty and the loop always makes progress.
        using Diff = typename std::iterator_traits<RandomIt>::difference_type;
        Diff i = -1;
        Diff j = last - first;
        while (true) {
            do { ++i; } while (comp(first[i], pivot));
            do { --j; } while (comp(pivot, first[j]));
            if (i >= j) break;
            std::iter_swap(first + i, first + j);
        }
        RandomIt split = first + j + 1;

        // Recurse on the smaller half, iterate on the larger.
        if (split - first < last - split) {
            quicksort(first, split, comp);
            first = split;
        } else {
            quicksort(split, last, comp);
            last = split;
        }
    }
}

template <typename T>
void quicksort(std::vector<T>& v) {
    quicksort(v.begin(), v.end());
}

template <typename T>
void print(const char* label, const std::vector<T>& v) {
    std::cout << label;
    for (const auto& x : v) std::cout << ' ' << x;
    std::cout << '\n';
}

int main() {
    std::vector<int> sample{38, 27, 43, 3, 9, 82, 10, 27, -5, 0, 43, 1};
    print("Before:", sample);
    quicksort(sample);
    print("After: ", sample);

    // Self-check against std::sort on random vectors plus edge cases.
    std::mt19937 rng(12345);
    std::vector<std::vector<int>> cases{
        {},                     // empty
        {42},                   // single element
        {7, 7, 7, 7, 7},        // all duplicates
        {5, 4, 3, 2, 1},        // reverse sorted
        {1, 2, 3, 4, 5},        // already sorted
    };
    std::uniform_int_distribution<std::size_t> len_dist(0, 200);
    while (cases.size() < 100) {
        std::size_t n = len_dist(rng);
        // Alternate between narrow (many duplicates) and wide value ranges.
        int range = (cases.size() % 2 == 0) ? 5 : 1000000;
        std::uniform_int_distribution<int> val_dist(-range, range);
        std::vector<int> v(n);
        for (auto& x : v) x = val_dist(rng);
        cases.push_back(std::move(v));
    }

    std::size_t passed = 0;
    for (std::size_t k = 0; k < cases.size(); ++k) {
        std::vector<int> expected = cases[k];
        std::vector<int> actual = cases[k];
        std::sort(expected.begin(), expected.end());
        quicksort(actual);
        if (actual == expected) {
            ++passed;
        } else {
            std::cout << "FAIL on case " << k << " (size " << cases[k].size() << ")\n";
        }
    }
    std::cout << "Self-check: " << passed << '/' << cases.size() << " passed\n";
    return passed == cases.size() ? 0 : 1;
}
