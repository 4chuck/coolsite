#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

#define MAX_QUESTIONS 10
#define MAX_ANSWER_LENGTH 256
#define FILENAME "scores.txt"

typedef struct {
    char question[MAX_ANSWER_LENGTH];
    char answers[4][MAX_ANSWER_LENGTH];
    char correct_answer[MAX_ANSWER_LENGTH];
} Question;

Question questions[MAX_QUESTIONS];
int question_count = 0;

typedef struct {
    char *data;
    size_t size;
} Memory;

size_t write_callback(void *contents, size_t size, size_t nmemb, void *userp) {
    size_t total_size = size * nmemb;
    Memory *mem = (Memory *)userp;

    char *ptr = realloc(mem->data, mem->size + total_size + 1);
    if (ptr == NULL) {
        printf("Error reallocating memory\n");
        return 0;
    }

    mem->data = ptr;
    memcpy(&(mem->data[mem->size]), contents, total_size);
    mem->size += total_size;
    mem->data[mem->size] = 0;

    return total_size;
}

int fetch_questions() {
    CURL *curl;
    CURLcode res;
    Memory chunk = {0};

    curl = curl_easy_init();
    if (!curl) {
        printf("Failed to initialize CURL\n");
        return 0;
    }

    const char *url = "https://opentdb.com/api.php?amount=10&type=multiple";
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&chunk);

    res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        curl_easy_cleanup(curl);
        return 0;
    }

    // Parse JSON (simple parsing for demo)
    char *ptr = strstr(chunk.data, "\"question\":\"");
    for (int i = 0; ptr && i < MAX_QUESTIONS; i++) {
        ptr += strlen("\"question\":\"");
        char *end = strchr(ptr, '\"');
        if (!end) break;
        strncpy(questions[i].question, ptr, end - ptr);
        questions[i].question[end - ptr] = '\0';

        // Parse answers
        for (int j = 0; j < 4; j++) {
            ptr = strstr(ptr, "\"answer\":\"");
            if (!ptr) break;
            ptr += strlen("\"answer\":\"");
            end = strchr(ptr, '\"');
            if (!end) break;
            strncpy(questions[i].answers[j], ptr, end - ptr);
            questions[i].answers[j][end - ptr] = '\0';
        }

        ptr = strstr(ptr, "\"correct_answer\":\"");
        if (ptr) {
            ptr += strlen("\"correct_answer\":\"");
            end = strchr(ptr, '\"');
            if (end) {
                strncpy(questions[i].correct_answer, ptr, end - ptr);
                questions[i].correct_answer[end - ptr] = '\0';
            }
        }
    }

    free(chunk.data);
    curl_easy_cleanup(curl);
    question_count = MAX_QUESTIONS;
    return 1;
}

void save_score(const char *name, int score) {
    FILE *file = fopen(FILENAME, "a");
    if (file == NULL) {
        perror("Error opening file");
        return;
    }
    fprintf(file, "%s %d\n", name, score);
    fclose(file);
}

void display_leaderboard() {
    FILE *file = fopen(FILENAME, "r");
    if (file == NULL) {
        printf("No leaderboard data available.\n");
        return;
    }

    char name[50];
    int score;
    printf("\n--- Leaderboard ---\n");

    while (fscanf(file, "%s %d", name, &score) != EOF) {
        printf("%s: %d\n", name, score);
    }

    fclose(file);
}

void play_game() {
    char name[50];
    int score = 0;
    char answer[MAX_ANSWER_LENGTH];

    printf("Enter your name: ");
    scanf("%49s", name);

    for (int i = 0; i < question_count; i++) {
        printf("\nQuestion %d: %s\n", i + 1, questions[i].question);
        for (int j = 0; j < 4; j++) {
            printf("%d) %s\n", j + 1, questions[i].answers[j]);
        }

        printf("Your answer: ");
        scanf("%s", answer);

        if (strcmp(answer, questions[i].correct_answer) == 0) {
            printf("Correct!\n");
            score += 10;
        } else {
            printf("Wrong! Correct answer: %s\n", questions[i].correct_answer);
        }
    }

    printf("\nGame Over! Your score: %d\n", score);
    save_score(name, score);
    display_leaderboard();
}

int main() {
    int choice;

    if (!fetch_questions()) {
        printf("Failed to fetch questions. Exiting...\n");
        return 1;
    }

    while (1) {
        printf("\n--- Quiz Game ---\n");
        printf("1. Play Game\n");
        printf("2. View Leaderboard\n");
        printf("3. Exit\n");
        printf("Choose an option: ");
        scanf("%d", &choice);

        switch (choice) {
            case 1:
                play_game();
                break;
            case 2:
                display_leaderboard();
                break;
            case 3:
                exit(0);
            default:
                printf("Invalid option! Try again.\n");
        }
    }

    return 0;
}
