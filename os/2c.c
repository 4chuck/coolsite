#include <stdio.h>

int main() {
    int n, tq, t = 0, rem;

    printf("Enter number of processes: ");
    scanf("%d", &n);

    int bt[n], rt[n], wt[n], tat[n];

    printf("Enter burst time for each process:\n");
    for (int i = 0; i < n; i++) {
        printf("P%d: ", i + 1);
        scanf("%d", &bt[i]);
        rt[i] = bt[i];
    }

    printf("Enter time quantum: ");
    scanf("%d", &tq);

    rem = n;

    while (rem > 0) {
        for (int i = 0; i < n; i++) {
            if (rt[i] == 0) continue;

            if (rt[i] > tq) {
                t += tq;
                rt[i] -= tq;
            } else {
                t += rt[i];
                tat[i] = t;
                wt[i]  = tat[i] - bt[i];
                rt[i] = 0;
                rem--;
            }
        }
    }

    printf("\nProcess\tBT\tWT\tTAT\n");
    for (int i = 0; i < n; i++)
        printf("P%d\t%d\t%d\t%d\n", i + 1, bt[i], wt[i], tat[i]);

    return 0;
}


// Sample Input/Output:
// Enter number of processes: 4
// Enter burst time for each process:
// P1: 5
// P2: 15
// P3: 4
// P4: 6
// Enter time quantum: 4