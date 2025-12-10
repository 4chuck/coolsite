#include <stdio.h>
#define MAX 25

void firstFit(int block[], int m, int process[], int n) {
    int alloc[n];
    for (int i = 0; i < n; i++) alloc[i] = -1;

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) {
            if (block[j] >= process[i]) {
                alloc[i] = j;
                block[j] -= process[i];
                break;
            }
        }
    }

    printf("\nFirst Fit:\n");
    for (int i = 0; i < n; i++) {
        if (alloc[i] != -1)
            printf("Process %d -> Block %d\n", i + 1, alloc[i] + 1);
        else
            printf("Process %d -> Not Allocated\n", i + 1);
    }
}

void bestFit(int block[], int m, int process[], int n) {
    int alloc[n];
    for (int i = 0; i < n; i++) alloc[i] = -1;

    for (int i = 0; i < n; i++) {
        int best = -1;
        for (int j = 0; j < m; j++) {
            if (block[j] >= process[i]) {
                if (best == -1 || block[j] < block[best])
                    best = j;
            }
        }
        if (best != -1) {
            alloc[i] = best;
            block[best] -= process[i];
        }
    }

    printf("\nBest Fit:\n");
    for (int i = 0; i < n; i++) {
        if (alloc[i] != -1)
            printf("Process %d -> Block %d\n", i + 1, alloc[i] + 1);
        else
            printf("Process %d -> Not Allocated\n", i + 1);
    }
}

void worstFit(int block[], int m, int process[], int n) {
    int alloc[n];
    for (int i = 0; i < n; i++) alloc[i] = -1;

    for (int i = 0; i < n; i++) {
        int worst = -1;
        for (int j = 0; j < m; j++) {
            if (block[j] >= process[i]) {
                if (worst == -1 || block[j] > block[worst])
                    worst = j;
            }
        }
        if (worst != -1) {
            alloc[i] = worst;
            block[worst] -= process[i];
        }
    }

    printf("\nWorst Fit:\n");
    for (int i = 0; i < n; i++) {
        if (alloc[i] != -1)
            printf("Process %d -> Block %d\n", i + 1, alloc[i] + 1);
        else
            printf("Process %d -> Not Allocated\n", i + 1);
    }
}

int main() {
    int block[MAX] = {100, 500, 200, 300, 600};
    int process[MAX] = {212, 417, 112, 426};
    int m = 5, n = 4;

    int block1[MAX], block2[MAX], block3[MAX];
    for (int i = 0; i < m; i++) {
        block1[i] = block[i];
        block2[i] = block[i];
        block3[i] = block[i];
    }

    firstFit(block1, m, process, n);
    bestFit(block2, m, process, n);
    worstFit(block3, m, process, n);

    return 0;
}
