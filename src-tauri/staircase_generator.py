def generate_staircase(arr):
    """
    Creează un staircase din array.
    Exemplu: [1, 2, 3, 4, 5, 6] -> [[1], [2, 3], [4, 5, 6]]
    Returnează False dacă array-ul nu permite un staircase perfect.
    """
    n = len(arr)
    staircase = []
    current_idx = 0
    row_length = 1

    while current_idx < n:
        # Verificăm dacă mai avem elemente suficiente pentru rândul curent
        if current_idx + row_length > n:
            return False
        
        # Extragem sub-array-ul pentru rândul curent
        row = arr[current_idx : current_idx + row_length]
        staircase.append(row)
        
        # Pregătim următorul pas
        current_idx += row_length
        row_length += 1
        
    return staircase

if __name__ == "__main__":
    # Teste
    test_cases = [
        ([1, 2, 3, 4, 5, 6], [[1], [2, 3], [4, 5, 6]]),
        ([1, 2, 3, 4, 5], False),
        ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]]),
        ([1, 2], [[1], [2]]), # Nu e perfect, rândul 2 ar trebui să aibă 2 elemente, dar avem doar 1
    ]

    for input_arr, expected in test_cases:
        result = generate_staircase(input_arr)
        print(f"Input: {input_arr} | Result: {result} | Expected: {expected} | {'✅' if result == expected else '❌'}")
