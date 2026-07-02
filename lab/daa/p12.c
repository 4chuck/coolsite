#include <stdio.h>
#include <math.h>

int x[10];

int place(int k, int i)
{
    int j;
    for(j = 1; j <= k - 1; j++)
        if(x[j] == i || abs(x[j] - i) == abs(j - k))
            return 0;
    return 1;
}

void nqueen(int k, int n)
{
    int i, j;

    for(i = 1; i <= n; i++)
    {
        if(place(k, i))
        {
            x[k] = i;

            if(k == n)
            {
                for(j = 1; j <= n; j++)
                    printf("%d ", x[j]);
                printf("\n");
            }
            else
                nqueen(k + 1, n);
        }
    }
}

int main()
{
    int n;

    printf("\nEnter number of queens:");
    scanf("%d", &n);

    nqueen(1, n);

    return 0;
}