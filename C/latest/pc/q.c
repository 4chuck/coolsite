#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>
#include <time.h>
#include <unistd.h>
#include <cjson/cJSON.h>  //for termux: #include "cJSON.h"

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

// ================= WRITE CALLBACK =================
size_t write_callback(void *contents, size_t size, size_t nmemb, void *userp) {
    size_t total_size = size * nmemb;
    Memory *mem = (Memory *)userp;

    char *ptr = realloc(mem->data, mem->size + total_size + 1);
    if (!ptr) return 0;

    mem->data = ptr;
    memcpy(&(mem->data[mem->size]), contents, total_size);
    mem->size += total_size;
    mem->data[mem->size] = '\0';

    return total_size;
}

// ================= HTML DECODE =================
void decode_html(char *str) {
    char *pos;
    while ((pos = strstr(str, "&quot;"))) {
        memmove(pos + 1, pos + 6, strlen(pos + 6) + 1);
        *pos = '"';
    }
    while ((pos = strstr(str, "&amp;"))) {
        memmove(pos + 1, pos + 5, strlen(pos + 5) + 1);
        *pos = '&';
    }
}

// ================= SHUFFLE =================
void shuffle_answers(Question *q) {
    char temp[MAX_ANSWER_LENGTH];
    int correct_index = 3;

    for (int i = 3; i > 0; i--) {
        int j = rand() % (i + 1);

        strncpy(temp, q->answers[i], MAX_ANSWER_LENGTH);
        strncpy(q->answers[i], q->answers[j], MAX_ANSWER_LENGTH);
        strncpy(q->answers[j], temp, MAX_ANSWER_LENGTH);

        if (i == correct_index) correct_index = j;
        else if (j == correct_index) correct_index = i;
    }

    strncpy(q->correct_answer, q->answers[correct_index], MAX_ANSWER_LENGTH);
}

// ================= FETCH =================
int fetch_questions(const char *difficulty) {
    CURL *curl;
    CURLcode res;
    Memory chunk = { .data = NULL, .size = 0 };

    curl = curl_easy_init();
    if (!curl) return 0;

    char url[256];
    sprintf(url, "https://opentdb.com/api.php?amount=10&category=18&difficulty=%s&type=multiple", difficulty);

    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&chunk);

    res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        curl_easy_cleanup(curl);
        free(chunk.data);
        return 0;
    }

    cJSON *json = cJSON_Parse(chunk.data);
    free(chunk.data);
    curl_easy_cleanup(curl);

    if (!json) return 0;

    cJSON *results = cJSON_GetObjectItem(json, "results");

    question_count = 0;
    cJSON *item;

    cJSON_ArrayForEach(item, results) {
        if (question_count >= MAX_QUESTIONS) break;

        cJSON *question = cJSON_GetObjectItem(item, "question");
        cJSON *correct = cJSON_GetObjectItem(item, "correct_answer");
        cJSON *incorrect = cJSON_GetObjectItem(item, "incorrect_answers");

        if (!cJSON_IsString(question) || !cJSON_IsString(correct)) continue;

        strncpy(questions[question_count].question, question->valuestring, MAX_ANSWER_LENGTH);
        decode_html(questions[question_count].question);

        int idx = 0;
        cJSON *ans;
        cJSON_ArrayForEach(ans, incorrect) {
            strncpy(questions[question_count].answers[idx], ans->valuestring, MAX_ANSWER_LENGTH);
            decode_html(questions[question_count].answers[idx]);
            idx++;
        }

        strncpy(questions[question_count].answers[idx], correct->valuestring, MAX_ANSWER_LENGTH);
        decode_html(questions[question_count].answers[idx]);

        shuffle_answers(&questions[question_count]);
        question_count++;
    }

    cJSON_Delete(json);
    return question_count;
}

// ================= SAVE =================
void save_score(const char *name, int score) {
    FILE *f = fopen(FILENAME, "a");
    if (!f) return;
    fprintf(f, "%s %d\n", name, score);
    fclose(f);
}

// ================= SORTED LEADERBOARD =================
void display_leaderboard() {
    FILE *f = fopen(FILENAME, "r");
    if (!f) {
        printf("No data.\n");
        return;
    }

    char names[100][50];
    int scores[100], n = 0;

    while (fscanf(f, "%49s %d", names[n], &scores[n]) != EOF) n++;
    fclose(f);

    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - i - 1; j++)
            if (scores[j] < scores[j + 1]) {
                int ts = scores[j]; scores[j] = scores[j+1]; scores[j+1] = ts;
                char tn[50]; strcpy(tn, names[j]);
                strcpy(names[j], names[j+1]);
                strcpy(names[j+1], tn);
            }

    printf("\n\033[1;33m--- Leaderboard ---\033[0m\n");
    for (int i = 0; i < n && i < 10; i++)
        printf("%d. %s: %d\n", i+1, names[i], scores[i]);
}

// ================= SAFE INPUT =================
int safe_input() {
    int x;
    if (scanf("%d", &x) != 1) {
        while (getchar() != '\n');
        return -1;
    }
    return x;
}

// ================= GAME =================
void play_game() {
    char name[50];
    int score = 0;

    printf("Enter your name: ");
    scanf("%49s", name);

    for (int i = 0; i < question_count; i++) {
        printf("\nQ%d: %s\n", i+1, questions[i].question);

        for (int j = 0; j < 4; j++)
            printf("%d) %s\n", j+1, questions[i].answers[j]);

        printf("You have 10 sec...\nAnswer: ");
        time_t start = time(NULL);

        int choice = safe_input();
        time_t end = time(NULL);

        if (choice < 1 || choice > 4 || (end-start) > 10) {
            printf("\033[31mInvalid/Timeout!\033[0m\n");
            continue;
        }

        if (strcmp(questions[i].answers[choice-1], questions[i].correct_answer) == 0) {
            printf("\033[32mCorrect!\033[0m\n");
            score += 10;
        } else {
            printf("\033[31mWrong! Ans: %s\033[0m\n", questions[i].correct_answer);
        }
    }

    printf("\nScore: %d\n", score);
    save_score(name, score);
    display_leaderboard();

    char again;
    printf("\nPlay again? (y/n): ");
    scanf(" %c", &again);
    if (again=='y' || again=='Y') play_game();
}

// ================= MAIN =================
int main() {
    srand(time(NULL));

    char difficulty[10];
    printf("Difficulty (easy/medium/hard): ");
    scanf("%9s", difficulty);

    if (!fetch_questions(difficulty)) {
        printf("Error fetching questions\n");
        return 1;
    }

    while (1) {
        printf("\n\033[1;34m--- Quiz Game ---\033[0m\n");
        printf("1. Play\n2. Leaderboard\n3. Exit\nChoice: ");

        int c = safe_input();

        switch (c) {
            case 1: play_game(); break;
            case 2: display_leaderboard(); break;
            case 3: exit(0);
            default: printf("Invalid!\n");
        }
    }
}