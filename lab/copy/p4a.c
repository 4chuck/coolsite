#include <stdio.h>
#include <stdlib.h>

int gcd(int a, int b)
{
    if (b != 0)
        return gcd(b, a % b);
    return a;
}

int main()
{
    int a, b;

    printf("\n Read two numbers:");
    scanf("%d%d", &a, &b);

    printf("\n GCD of %d and %d is %d\n", a, b, gcd(a, b));

    return 0;
}
