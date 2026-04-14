#include <stdio.h>
#include <string.h>

#define MAX 256

void createShiftTable(char *pattern, int patternLength, int shiftTable[]) {
    for (int i = 0; i < MAX; i++) {
        shiftTable[i] = patternLength;
    }

    for (int i = 0; i < patternLength - 1; i++) {
        shiftTable[(unsigned char)pattern[i]] = patternLength - 1 - i;
    }
}

int horspoolMatching(char *text, char *pattern) {
    int textLength = strlen(text);
    int patternLength = strlen(pattern);
    int shiftTable[MAX];

    createShiftTable(pattern, patternLength, shiftTable);

    int i = patternLength - 1;

    while (i < textLength) {
        int k = 0;

        while (k < patternLength && pattern[patternLength - 1 - k] == text[i - k]) {
            k++;
        }

        if (k == patternLength) {
            return i - patternLength + 1;
        } else {
            i += shiftTable[(unsigned char)text[i]];
        }
    }

    return -1;
}

int main() {
    char text, pattern;

    printf("Enter the text: ");
    fgets(text, sizeof(text), stdin);
    text[strcspn(text, "\n")] = '\0';

    printf("Enter the pattern: ");
    fgets(pattern, sizeof(pattern), stdin);
    pattern[strcspn(pattern, "\n")] = '\0';

    int position = horspoolMatching(text, pattern);

    if (position != -1) {
        printf("Pattern found at position: %d\n", position);
    } else {
        printf("Pattern not found in the text.\n");
    }

    return 0;
}