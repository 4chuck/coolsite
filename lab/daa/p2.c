#include <stdio.h>
#include <stdlib.h>

int count = 0;

void merge(int a, int left, int mid, int right) {
    int i, j, k, b;
    i = left;
    j = mid + 1;
    k = left;

    while ((i <= mid) && (j <= right)) {
        count++;
        if (a[i] < a[j]) {
            b[k++] = a[i++];
        } else {
            b[k++] = a[j++];
        }
    }

    while (i <= mid) {
        b[k++] = a[i++];
    }
    while (j <= right) {
        b[k++] = a[j++];
    }

    for (i = left; i <= right; i++) {
        a[i] = b[i];
    }
}

void mergesort(int a, int left, int right) {
    int mid;
    if (left < right) {
        mid = (left + right) / 2;
        mergesort(a, left, mid);
        mergesort(a, mid + 1, right);
        merge(a, left, mid, right);
    }
}

int main() {
    int i, n, a;

    printf("Enter no of elements: ");
    scanf("%d", &n);

    printf("Enter elements\n");
    for (i = 0; i < n; i++) {
        scanf("%d", &a[i]);
    }

    mergesort(a, 0, n - 1);

    printf("\nSorted elements:\n");
    for (i = 0; i < n; i++) {
        printf("%d\n", a[i]);
    }

    printf("\nNumber of counts: %d\n", count);
    return 0;
}