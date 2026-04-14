#include <stdio.h>
#include <stdlib.h>

int topo, k;

void dfs(int a, int n, int v, int source) {
    int i;
    v[source] = 1;

    for (i = 1; i <= n; i++) {
        if (v[i] == 0 && a[source] [i] == 1) {
            dfs(a, n, v, i);
        }
    }
    topo[++k] = source;
}

int main() {
    int n, i, j, a, v;

    printf("Enter the no of Vertices: ");
    scanf("%d", &n);

    printf("Enter the Adjacency matrix\n");
    for (i = 1; i <= n; i++) {
        for (j = 1; j <= n; j++) {
            scanf("%d", &a[i] [j]);
        }
    }

    for (i = 1; i <= n; i++) {
        v[i] = 0;
    }

    for (i = 1; i <= n; i++) {
        if (v[i] == 0) {
            dfs(a, n, v, i);
        }
    }

    printf("\nThe topological ordering is\n");
    for (i = k; i >= 1; i--) {
        printf("%d\t", topo[i]);
    }
    printf("\n");

    return 0;
}