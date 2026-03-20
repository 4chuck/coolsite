#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>
#include <time.h>
#include "cJSON.h"

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
        fprintf(stderr, "Error reallocating memory.\n");
        free(mem->data);
        return 0;
    }

    mem->data = ptr;
    memcpy(&(mem->data[mem->size]), contents, total_size);
    mem->size += total_size;
    mem->data[mem->size] = '\0';

    return total_size;
}

void shuffle_answers(Question *q) {
    char temp[MAX_ANSWER_LENGTH];
    int correct_index = 3;  // Correct answer is initially placed at index 3.

    // Fisher-Yates shuffle
    for (int i = 3; i > 0; i--) {
        int j = rand() % (i + 1);

        // Swap answers[i] and answers[j]
        strncpy(temp, q->answers[i], MAX_ANSWER_LENGTH - 1);
        strncpy(q->answers[i], q->answers[j], MAX_ANSWER_LENGTH - 1);
        strncpy(q->answers[j], temp, MAX_ANSWER_LENGTH - 1);

        // Update the correct_index if it gets swapped
        if (i == correct_index) {
            correct_index = j;
        } else if (j == correct_index) {
            correct_index = i;
        }
    }

    // Ensure the `correct_answer` field points to the updated correct answer
    strncpy(q->correct_answer, q->answers[correct_index], MAX_ANSWER_LENGTH - 1);
}

int fetch_questions() {
    CURL *curl;
    CURLcode res;
    Memory chunk = { .data = NULL, .size = 0 };

    curl = curl_easy_init();
    if (!curl) {
        fprintf(stderr, "Failed to initialize CURL\n");
        return 0;
    }

    const char *url = "https://opentdb.com/api.php?amount=10&category=18&type=multiple";
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, (void *)&chunk);

    res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        fprintf(stderr, "curl_easy_perform() failed: %s\n", curl_easy_strerror(res));
        curl_easy_cleanup(curl);
        free(chunk.data);
        return 0;
    }

    // Parse JSON using cJSON
    cJSON *json = cJSON_Parse(chunk.data);
    free(chunk.data);
    curl_easy_cleanup(curl);

    if (!json) {
        fprintf(stderr, "Error parsing JSON: %s\n", cJSON_GetErrorPtr());
        return 0;
    }

    cJSON *results = cJSON_GetObjectItemCaseSensitive(json, "results");
    if (!cJSON_IsArray(results)) {
        fprintf(stderr, "Error: Results field is not an array.\n");
        cJSON_Delete(json);
        return 0;
    }

    question_count = 0;
    cJSON *item;
    cJSON_ArrayForEach(item, results) {
        if (question_count >= MAX_QUESTIONS) break;

        cJSON *question = cJSON_GetObjectItemCaseSensitive(item, "question");
        cJSON *correct_answer = cJSON_GetObjectItemCaseSensitive(item, "correct_answer");
        cJSON *incorrect_answers = cJSON_GetObjectItemCaseSensitive(item, "incorrect_answers");

        if (!cJSON_IsString(question) || !cJSON_IsString(correct_answer) || !cJSON_IsArray(incorrect_answers)) {
            continue;
        }

        strncpy(questions[question_count].question, question->valuestring, MAX_ANSWER_LENGTH - 1);
        strncpy(questions[question_count].correct_answer, correct_answer->valuestring, MAX_ANSWER_LENGTH - 1);

        int answer_index = 0;
        cJSON *answer;
        cJSON_ArrayForEach(answer, incorrect_answers) {
            if (answer_index >= 3) break;
            if (cJSON_IsString(answer)) {
                strncpy(questions[question_count].answers[answer_index], answer->valuestring, MAX_ANSWER_LENGTH - 1);
                answer_index++;
            }
        }

        // Add the correct answer to the last slot
        strncpy(questions[question_count].answers[answer_index], correct_answer->valuestring, MAX_ANSWER_LENGTH - 1);

        // Shuffle answers
        shuffle_answers(&questions[question_count]);

        question_count++;
    }

    cJSON_Delete(json);
    return question_count > 0;
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

    while (fscanf(file, "%49s %d", name, &score) != EOF) {
        printf("%s: %d\n", name, score);
    }

    fclose(file);
}

void play_game() {
    char name[50];
    int score = 0;

    printf("Enter your name: ");
    scanf("%49s", name);

    for (int i = 0; i < question_count; i++) {
        printf("\nQuestion %d: %s\n", i + 1, questions[i].question);
        for (int j = 0; j < 4; j++) {
            printf("%d) %s\n", j + 1, questions[i].answers[j]);
        }

        printf("Your answer (1-4): ");
        int choice;
        scanf("%d", &choice);
        if (choice < 1 || choice > 4) {
            printf("Invalid choice. Skipping question.\n");
            continue;
        }

        if (strcmp(questions[i].answers[choice - 1], questions[i].correct_answer) == 0) {
            printf("\033[0;32mCorrect! You chose the right answer.\033[0m\n");
            score += 10;
        } else {
            printf("\033[0;31mIncorrect! The correct answer was: %s.\033[0m\n", questions[i].correct_answer);
        }
    }

    printf("\nGame Over! Your score: %d\n", score);
    save_score(name, score);
    display_leaderboard();
}

int main() {
    srand(time(NULL));  // Initialize random seed

    if (!fetch_questions()) {
        printf("Failed to fetch questions. Exiting...\n");
        return 1;
    }

    int choice;
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
