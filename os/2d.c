#include <stdio.h>

int main() {
    int n, i, j;
    printf("Enter number of processes: ");
    scanf("%d", &n);

    int bt[n], p[n], priority[n], wt[n], tat[n], temp;

    printf("Enter burst time and priority for each process:\n");
    for (i = 0; i < n; i++) {
        printf("P%d:\n", i + 1);
        printf("Burst Time: ");
        scanf("%d", &bt[i]);
        printf("Priority (lower number = higher priority): ");
        scanf("%d", &priority[i]);
        p[i] = i + 1;
    }

    // Sort based on priority
    for (i = 0; i < n - 1; i++) {
        for (j = i + 1; j < n; j++) {
            if (priority[i] > priority[j]) {
                temp = priority[i];
                priority[i] = priority[j];
                priority[j] = temp;

                temp = bt[i];
                bt[i] = bt[j];
                bt[j] = temp;

                temp = p[i];
                p[i] = p[j];
                p[j] = temp;
            }
        }
    }

    wt[0] = 0;
    for (i = 1; i < n; i++)
        wt[i] = wt[i - 1] + bt[i - 1];

    for (i = 0; i < n; i++)
        tat[i] = wt[i] + bt[i];

    printf("\nProcess\tBT\tPriority\tWT\tTAT\n");
    for (i = 0; i < n; i++)
        printf("P%d\t%d\t%d\t\t%d\t%d\n", p[i], bt[i], priority[i], wt[i], tat[i]);

    return 0;
}


// Sample Input/Output:
// Enter number of processes: 4
// Enter burst time and priority for each process:
// P1:
// Burst Time: 10
// Priority (lower number = higher priority): 2
// P2:
// Burst Time: 5
// Priority (lower number = higher priority): 1
// P3:
// Burst Time: 8
// Priority (lower number = higher priority): 4
// P4:
// Burst Time: 6
// Priority (lower number = higher priority): 3
