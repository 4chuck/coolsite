#include <stdio.h>

int main()
{
    int n, i, j, min, u, v;
    int cost[10][10], visited[10] = {0};
    int ne = 1, mincost = 0;

    printf("\nEnter the number of vertices:");
    scanf("%d", &n);

    printf("\nEnter the cost adjacency matrix:\n");
    for(i = 1; i <= n; i++)
        for(j = 1; j <= n; j++)
        {
            scanf("%d", &cost[i][j]);
            if(cost[i][j] == 0)
                cost[i][j] = 999;
        }

    visited[1] = 1;

    while(ne < n)
    {
        for(i = 1, min = 999; i <= n; i++)
            for(j = 1; j <= n; j++)
                if(cost[i][j] < min)
                    if(visited[i] != 0)
                    {
                        min = cost[i][j];
                        u = i;
                        v = j;
                    }

        if(visited[u] == 0 || visited[v] == 0)
        {
            printf("\nEdge %d:(%d %d) cost:%d", ne++, u, v, min);
            mincost += min;
            visited[v] = 1;
        }

        cost[u][v] = cost[v][u] = 999;
    }

    printf("\nMinimum cost = %d", mincost);

    return 0;
}