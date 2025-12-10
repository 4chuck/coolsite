#include <stdio.h>

#define MAX_PROCESSES 5
#define MAX_RESOURCES 3

void calculateNeed(int need[MAX_PROCESSES][MAX_RESOURCES],
                   int max[MAX_PROCESSES][MAX_RESOURCES],
                   int allocated[MAX_PROCESSES][MAX_RESOURCES],
                   int n, int m) {
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            need[i][j] = max[i][j] - allocated[i][j];
}

int isSafe(int processes[], int avail[], int max[][MAX_RESOURCES],
           int allocated[][MAX_RESOURCES], int n, int m) {

    int need[MAX_PROCESSES][MAX_RESOURCES];
    calculateNeed(need, max, allocated, n, m);

    int finish[MAX_PROCESSES] = {0};
    int safeSeq[MAX_PROCESSES];
    int work[MAX_RESOURCES];

    for (int i = 0; i < m; i++)
        work[i] = avail[i];

    int count = 0;

    while (count < n) {
        int found = 0;

        for (int p = 0; p < n; p++) {
            if (finish[p] == 0) {
                int j;
                for (j = 0; j < m; j++)
                    if (need[p][j] > work[j])
                        break;

                if (j == m) {
                    for (int k = 0; k < m; k++)
                        work[k] += allocated[p][k];

                    safeSeq[count++] = p;
                    finish[p] = 1;
                    found = 1;
                }
            }
        }

        if (!found) {
            printf("System is not in a safe state.\n");
            return 0;
        }
    }

    printf("System is in a safe state.\nSafe sequence is: ");
    for (int i = 0; i < n; i++)
        printf("%d ", safeSeq[i]);
    printf("\n");

    return 1;
}

int main() {
    int n, m;
    int processes[MAX_PROCESSES];
    int avail[MAX_RESOURCES];
    int max[MAX_PROCESSES][MAX_RESOURCES];
    int allocated[MAX_PROCESSES][MAX_RESOURCES];

    printf("Enter the number of processes: ");
    scanf("%d", &n);

    printf("Enter the number of resource types: ");
    scanf("%d", &m);

    for (int i = 0; i < n; i++)
        processes[i] = i;

    printf("Enter the available resources: ");
    for (int i = 0; i < m; i++)
        scanf("%d", &avail[i]);

    printf("Enter the maximum resource matrix:\n");
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            scanf("%d", &max[i][j]);

    printf("Enter the allocated resource matrix:\n");
    for (int i = 0; i < n; i++)
        for (int j = 0; j < m; j++)
            scanf("%d", &allocated[i][j]);

    isSafe(processes, avail, max, allocated, n, m);
    return 0;
}


//Sample Input:
//Enter the number of processes: 5
//Enter the number of resource types: 3
//Enter the available resources: 3 3 2
//Enter the maximum resource matrix:
//7 5 3
//3 2 2
//9 0 2
//2 2 2
//4 3 3
//Enter the allocated resource matrix:
//0 1 0
//2 0 0
//3 0 2
//2 1 1
//0 0 2
//System is in a safe state.