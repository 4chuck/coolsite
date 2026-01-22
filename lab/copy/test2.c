#include <stdio.h>
#include <stdlib.h>
#include <ctype.h>

#define SIZE 20

struct stack
{
    int top;
    char data[SIZE];
};

typedef struct stack STACK;

void push(STACK *s, char item)
{
    s->data[++(s->top)] = item;
}

char pop(STACK *s)
{
    return s->data[(s->top)--];
}

int precedence(char symbol)
{
    switch (symbol)
    {
        case '+':
        case '-': return 1;
        case '*':
        case '/':
        case '%': return 2;
        case '^': return 3;
        default: return 0;
    }
}

int main()
{
    STACK s;
    char infix[SIZE], postfix[SIZE], symbol;
    int i, j = 0;

    s.top = -1;

    printf("\n Read infix expression\n");
    scanf("%s", infix);

    for (i = 0; infix[i] != '\0'; i++)
    {
        symbol = infix[i];

        if (isalnum(symbol))
            postfix[j++] = symbol;
        else
        {
            while (s.top != -1 && precedence(s.data[s.top]) >= precedence(symbol))
                postfix[j++] = pop(&s);

            push(&s, symbol);
        }
    }

    while (s.top != -1)
        postfix[j++] = pop(&s);

    postfix[j] = '\0';

    printf("\n Postfix expression is %s\n", postfix);

    return 0;
}