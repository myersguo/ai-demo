package main

import (
	"fmt"
	"math/rand"
	"os"
	"slices"
	"sort"
)

// quickSort sorts a in place using Hoare-style partitioning around the
// middle element. It recurses into the smaller side and loops on the larger
// one, so stack depth stays O(log n) even on adversarial input.
func quickSort(a []int) {
	for len(a) > 1 {
		pivot := a[len(a)/2]
		i, j := 0, len(a)-1
		for i <= j {
			for a[i] < pivot {
				i++
			}
			for a[j] > pivot {
				j--
			}
			if i <= j {
				a[i], a[j] = a[j], a[i]
				i++
				j--
			}
		}
		// Now a[:j+1] <= pivot <= a[i:].
		if j+1 < len(a)-i {
			quickSort(a[:j+1])
			a = a[i:]
		} else {
			quickSort(a[i:])
			a = a[:j+1]
		}
	}
}

func main() {
	sample := []int{38, 27, 43, 3, 9, 82, 10, 3, -5, 27}
	fmt.Println("before:", sample)
	quickSort(sample)
	fmt.Println("after: ", sample)

	rng := rand.New(rand.NewSource(42))
	cases := [][]int{{}, {7}, {5, 5, 5, 5}, {2, 1}, {1, 2, 3, 4, 5}, {5, 4, 3, 2, 1}}
	for len(cases) < 100 {
		n := rng.Intn(200)
		s := make([]int, n)
		limit := 10 // small range forces many duplicates
		if len(cases)%2 == 0 {
			limit = 1000
		}
		for k := range s {
			s[k] = rng.Intn(2*limit) - limit
		}
		cases = append(cases, s)
	}

	for idx, c := range cases {
		got := slices.Clone(c)
		want := slices.Clone(c)
		quickSort(got)
		sort.Ints(want)
		if !slices.Equal(got, want) {
			fmt.Printf("FAIL case %d: input=%v got=%v want=%v\n", idx, c, got, want)
			os.Exit(1)
		}
	}
	fmt.Printf("self-check passed: %d slices match sort.Ints\n", len(cases))
}
