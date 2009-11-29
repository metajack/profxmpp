Referee.Board = function () {
    this.board = [[' ', ' ', ' '], [' ', ' ', ' '], [' ', ' ', ' ']];
};

Referee.Board.prototype = {
    validMove: function (side, col, row) {
        var curSide = this.currentSide();
        if (side !== curSide) {
            return false;
        }

        var coords = this.moveToCoords(col, row);
        if (this.board[coords.row][coords.col] !== ' ') {
            return false;
        }

        return true;
    },

    move: function (side, col, row) {
        if (this.validMove(side, col, row)) {
            var coords = this.moveToCoords(col, row);
            this.board[coords.row][coords.col] = side;
        } else {
            throw {
                name: "BoardError",
                message: "Move invalid"
            };
        }
    },

    moveToCoords: function (col, row) {
        var map = {'a': 0, 'b': 1, 'c': 2, '1': 0, '2': 1, '3': 2};
        var coords = {row: null, col: null};
        coords.col = map[col];
        coords.row = map[row];
        return coords;
    },

    currentSide: function () {
        var r, c;
        var x = 0, o = 0;

        for (r = 0; r < 3; r++) {
            for (c = 0; c < 3; c++) {
                if (this.board[r][c] === 'x') {
                    x += 1;
                } else if (this.board[r][c] === 'o') {
                    o += 1;
                }
            }
        }
        
        if (x === o) {
            return 'x';
        }

        return 'o';
    },

    gameOver: function () {
        var r, c;
        
        // check for row wins
        for (r = 0; r < 3; r++) {
            if (this.board[r][0] === 'x' &&
                this.board[r][1] === 'x' &&
                this.board[r][2] === 'x') {
                return 'x';
            } else if (this.board[r][0] === 'o' &&
                       this.board[r][1] === 'o' &&
                       this.board[r][2] === 'o') {
                return 'o';
            }
        }

        // check for column wins
        for (c = 0; c < 3; c++) {
            if (this.board[0][c] === 'x' &&
                this.board[1][c] === 'x' &&
                this.board[2][c] === 'x') {
                return 'x';
            } else if (this.board[0][c] === 'o' &&
                       this.board[1][c] === 'o' &&
                       this.board[2][c] === 'o') {
                return 'o';
            }
        }

        // check for diagonal wins
        if (this.board[0][0] === 'x' &&
            this.board[1][1] === 'x' &&
            this.board[2][2] === 'x') {
            return 'x';
        } else if (this.board[0][0] === 'o' &&
                   this.board[1][1] === 'o' &&
                   this.board[2][2] === 'o') {
            return 'o';
        } else if (this.board[0][2] === 'x' &&
                   this.board[1][1] === 'x' &&
                   this.board[2][0] === 'x') {
            return 'x';
        } else if (this.board[0][2] === 'o' &&
                   this.board[1][1] === 'o' &&
                   this.board[2][0] === 'o') {
            return 'o';
        }

        // check for a tie
        var tie = true;
        for (r = 0; r < 3; r++) {
            if (this.board[r].indexOf(' ') >= 0) {
                tie = false;
                break;
            }
        }

        if (tie) {
            return "=";
        }

        return false;
    },

    toString: function () {
        var r, s = '';

        for (r = 0; r < 3; r++) {
            s += this.board[r].join('');
        }

        return s;
    }
};