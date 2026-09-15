CXX      ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -Wpedantic
BIN      := gmm
OBJ      := gmm.o main.o

.PHONY: all clean run check

all: $(BIN)

$(BIN): $(OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJ)

gmm.o: gmm.cpp gmm.hpp
	$(CXX) $(CXXFLAGS) -c gmm.cpp -o $@

main.o: main.cpp gmm.hpp
	$(CXX) $(CXXFLAGS) -c main.cpp -o $@

run: $(BIN)
	./$(BIN)

check: $(BIN)
	./$(BIN) --json --reps 50

clean:
	rm -f $(BIN) $(OBJ)
