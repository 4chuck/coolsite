#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <arpa/inet.h>
#include <curl/curl.h>
#include <cjson/cJSON.h>

#define PORT 8080
#define BUFFER_SIZE 1024
#define MAX_CLIENTS 10
#define MAX_QUESTIONS 10
#define MAX_OPTIONS 4

typedef struct {
    char question[BUFFER_SIZE];
    char options[MAX_OPTIONS][BUFFER_SIZE];
    int correct_option;
} TriviaQuestion;

typedef struct {
    int socket;
    char name[50];
    int score;
} Client;

TriviaQuestion questions[MAX_QUESTIONS];
int total_questions = 0;

Client clients[MAX_CLIENTS];
int client_count = 0;

pthread_mutex_t client_lock;

void broadcast_message(const char *message) {
    pthread_mutex_lock(&client_lock);
    for (int i = 0; i < client_count; i++) {
        send(clients[i].socket, message, strlen(message), 0);
    }
    pthread_mutex_unlock(&client_lock);
}

size_t write_callback(void *ptr, size_t size, size_t nmemb, char *data) {
    strcat(data, (char *)ptr);
    return size * nmemb;
}

void fetch_questions() {
    CURL *curl = curl_easy_init();
    char response[BUFFER_SIZE * 10] = {0};
    
    if (curl) {
        curl_easy_setopt(curl, CURLOPT_URL, "https://opentdb.com/api.php?amount=10&type=multiple");
        curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, response);
        CURLcode res = curl_easy_perform(curl);
        curl_easy_cleanup(curl);

        if (res != CURLE_OK) {
            fprintf(stderr, "Failed to fetch questions.\n");
            exit(EXIT_FAILURE);
        }

        cJSON *json = cJSON_Parse(response);
        cJSON *results = cJSON_GetObjectItemCaseSensitive(json, "results");
        total_questions = cJSON_GetArraySize(results);

        for (int i = 0; i < total_questions; i++) {
            cJSON *item = cJSON_GetArrayItem(results, i);
            strcpy(questions[i].question, cJSON_GetObjectItemCaseSensitive(item, "question")->valuestring);

            cJSON *correct_answer = cJSON_GetObjectItemCaseSensitive(item, "correct_answer");
            cJSON *incorrect_answers = cJSON_GetObjectItemCaseSensitive(item, "incorrect_answers");

            questions[i].correct_option = rand() % (MAX_OPTIONS) + 1;

            for (int j = 0, k = 1; j < cJSON_GetArraySize(incorrect_answers) + 1; j++) {
                if (j + 1 == questions[i].correct_option) {
                    strcpy(questions[i].options[j], correct_answer->valuestring);
                } else {
                    strcpy(questions[i].options[j], cJSON_GetArrayItem(incorrect_answers, k - 1)->valuestring);
                    k++;
                }
            }
        }
        cJSON_Delete(json);
    }
}

void send_question(int client_socket, int question_index) {
    char message[BUFFER_SIZE];
    sleep(1);
    snprintf(message, sizeof(message), 
        "Q%d: %s\n1. %s\n2. %s\n3. %s\n4. %s\nEnter your answer (1-4): ",
        question_index + 1,
        questions[question_index].question,
        questions[question_index].options[0],
        questions[question_index].options[1],
        questions[question_index].options[2],
        questions[question_index].options[3]
    );
    send(client_socket, message, strlen(message), 0);
}

void *handle_client(void *arg) {
    int client_socket = *(int *)arg;
    free(arg);

    char buffer[BUFFER_SIZE];
    char name[50];

    // Receive client name
    memset(buffer, 0, sizeof(buffer));
    recv(client_socket, buffer, sizeof(buffer), 0);
    strcpy(name, buffer);

    pthread_mutex_lock(&client_lock);
    clients[client_count].socket = client_socket;
    strcpy(clients[client_count].name, name);
    clients[client_count].score = 0;
    client_count++;
    pthread_mutex_unlock(&client_lock);

    printf("Client '%s' connected.\n", name);

    // Wait for other players
    while (client_count < 2) {
        sleep(1);
    }

    if (client_socket == clients[0].socket) {
        broadcast_message("Starting in 3...\n");
        sleep(1);
        broadcast_message("Starting in 2...\n");
        sleep(1);
        broadcast_message("Starting in 1...\n");
        sleep(1);
        broadcast_message("Go!\n");
    }

    for (int i = 0; i < total_questions; i++) {
        send_question(client_socket, i);

        memset(buffer, 0, sizeof(buffer));
        recv(client_socket, buffer, sizeof(buffer), 0); // Receive answer

        int answer = atoi(buffer); // Convert input to integer
        char feedback[BUFFER_SIZE];

        if (answer == questions[i].correct_option) {
            snprintf(feedback, sizeof(feedback), "\033[0;32mCorrect! You chose the right answer.\033[0m\n");
            pthread_mutex_lock(&client_lock);
            for (int j = 0; j < client_count; j++) {
                if (clients[j].socket == client_socket) {
                    clients[j].score++;
                }
            }
            pthread_mutex_unlock(&client_lock);
        } else {
            snprintf(feedback, sizeof(feedback), "\033[0;31mIncorrect! The correct answer was: %s.\033[0m\n",
                     questions[i].options[questions[i].correct_option - 1]);
        }
        send(client_socket, feedback, strlen(feedback), 0);
        sleep(1); // Add a small delay before sending the next question
    }

    if (client_socket == clients[0].socket) {
        char leaderboard[BUFFER_SIZE] = "Game Over! Calculating results...\nLeaderboard:\n";
        pthread_mutex_lock(&client_lock);
        for (int i = 0; i < client_count; i++) {
            char entry[100];
            snprintf(entry, sizeof(entry), "%d. %s - %d points\n", i + 1, clients[i].name, clients[i].score);
            strcat(leaderboard, entry);
        }
        pthread_mutex_unlock(&client_lock);
        broadcast_message(leaderboard);
    }

    close(client_socket);
    pthread_exit(NULL);
}

int main() {
    int server_socket, client_socket;
    struct sockaddr_in server_addr, client_addr;
    socklen_t addr_len = sizeof(client_addr);

    pthread_mutex_init(&client_lock, NULL);

    fetch_questions();

    server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket < 0) {
        perror("Socket creation failed");
        exit(EXIT_FAILURE);
    }

    server_addr.sin_family = AF_INET;
    server_addr.sin_port = htons(PORT);
    server_addr.sin_addr.s_addr = INADDR_ANY;

    if (bind(server_socket, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0) {
        perror("Bind failed");
        exit(EXIT_FAILURE);
    }

    if (listen(server_socket, MAX_CLIENTS) < 0) {
        perror("Listen failed");
        exit(EXIT_FAILURE);
    }

    printf("Server is running on port %d\n", PORT);

    while (1) {
        client_socket = accept(server_socket, (struct sockaddr *)&client_addr, &addr_len);
        if (client_socket < 0) {
            perror("Accept failed");
            continue;
        }

        pthread_t thread_id;
        int *new_sock = malloc(1);
        *new_sock = client_socket;
        pthread_create(&thread_id, NULL, handle_client, (void *)new_sock);
    }

    close(server_socket);
    pthread_mutex_destroy(&client_lock);
    return 0;
}
