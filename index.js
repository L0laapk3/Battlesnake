const bodyParser = require('body-parser')
const express = require('express')

const PORT = process.env.PORT || 3000

const app = express()
app.use(bodyParser.json())

app.get('/', handleIndex);
app.post('/start', handleStart);
app.post('/move', handleMove);
app.post('/end', handleEnd);

app.listen(PORT, () => console.log(`Battlesnake Server listening at http://127.0.0.1:${PORT}`))

const aStar = require('a-star');


function *mapGenerator(g, mapper) {
	for (const x of g)
		yield mapper(x);
}
function *filterGenerator(g, filter) {
	for (const x of g)
		if (filter(x))
			yield x;
}
function maxFromGenerator(g, evaluator) {
	let bestValue = -Infinity;
	let best;
	for (const x of g) {
		const value = evaluator(x);
		if (value > bestValue) {
			bestValue = value;
			best = x;
		}
	}
	return best;
}


function handleIndex(request, response) {
	let battlesnakeInfo = {
		apiversion: '1',
		author: 'L0laapk3',
		color: '#FFA500',
		head: 'default',
		tail: 'default'
	}
	response.status(200).json(battlesnakeInfo)
}

function handleStart(request, response) {
	console.log('START');
	// response.status(404).send('no');
	response.status(200).send('ok');
}


class Node {
	constructor(x, y, value, freeIn) {
		if (x.x) {
			this.x = x.x;
			this.y = x.y;
			this.value = x.value;
			this.freeIn = x.freeIn;
		} else {
			this.x = x;
			this.y = y;
			this.value = value || 0;
			this.freeIn = freeIn || 0;
		}
	}
	equals(other) {
		return this.x == other.x && this.y == other.y;
	}
	distance(other) {
		return Math.abs(this.x - other.x) + Math.abs(this.y - other.y);
	}
	direction(to) {
		if (this.distance(to) != 1) {
			console.error(this, to);
			throw new Error("bad direction call");
		}

		if (this.x != to.x)
			return to.x > this.x ? "right" : "left";
		if (this.y != to.y)
			return to.y > this.y ? "up" : "down";
	}
}

class Board {
	constructor(height, width) {
		const response = width ? {you: {}, board: {snakes: [], food: []}} : height
		height = width ? height : response.board.height;
		width = width ? width : response.board.width;

		this.cells = new Array(height).fill().map(x => new Array(width).fill(0));
		for (let y = 0; y < height; y++)
			for (let x = 0; x < width; x++) {
				this.cells[y][x] = new Node(x, y);
			}


		this.food = new Array(response.board.food.length);
		for (let foodI = 0; foodI < response.board.food.length; foodI++) {
			const foodResponse = response.board.food[foodI];
			this.food[foodI] = this.cells[foodResponse.y][foodResponse.x];
			this.food[foodI].value = -1;
		}

		this.snakes = [];
		for (let snakeResponse of response.board.snakes) {
			const snake = new Array(snakeResponse.body.length);
			this.snakes.push(snake);
			if (snakeResponse.id == response.you.id)
				this.me = snake;
			for (let cellI = 0; cellI < snake.length; cellI++) {
				const cell = snakeResponse.body[cellI];
				snake[cellI] = this.cells[cell.y][cell.x];
				if (cell < snake.length - 1 || true) {
					snake[cellI].value = this.snakes.length;
					snake[cellI].freeIn = Math.max(snake[cellI].freeIn, snakeResponse.body.length - cellI - 1);
				}
			}
		}
		for (let snake of this.snakes) {
			if (snake != this.me && snake.length >= this.me.length)
				for (let neighbor of this.neighbors(snake[0])) {
					if (neighbor.freeIn <= 0) {
						neighbor.value  = snake[0].value;
						neighbor.freeIn = snake.length;
					}
				}
		}
	}

	fillCount(node) {
		// TODO: faster
		const nodes = [];
		const unexplored = [node];
		while (unexplored.length) {
			const node = unexplored.pop();
			for (let neighbor of this.neighbors(node))
				if (neighbor.freeIn <= 0 && nodes.indexOf(neighbor) == -1)
					unexplored.push(neighbor);
			nodes.push(node);
		}

		return nodes.length;
	}

	height() {
		return this.cells.length;
	}
	width() {
		return this.cells[0].length;
	}

	getNode(x, y) {
		const node = this.cells[y][x];
		if (node == undefined)
			throw new Error(`getNode oob (${x}, ${y})`);
		return node;
	}

	print() {
		let row = this.cells.length;
		let s = "";
		while (row >= -1) {
			for (let c = -1; c <= this.cells[0].length; c++) {
				const leftRightBorder = c < 0 || c == this.cells[0].length;
				let bottomCell = row >= 0 && (leftRightBorder || row == 0 || this.cells[row-1][c].value > 0);
				if (leftRightBorder || row == this.cells.length || row < 0 || this.cells[row][c].value > 0) {
					if (bottomCell)
						s += '█';
					else
						s += '▀';
				} else {
					if (bottomCell)
						s += '▄';
					else
						s += ' ';
				}
			}
			row -= 2;
			if (row >= -1)
				s += '\n';
		}
		console.log(s);
	}
	
	*neighbors(node) {
		if (node.x > 0)
			yield this.getNode(node.x - 1, node.y);
		if (node.x < this.cells[0].length - 1)
			yield this.getNode(node.x + 1, node.y);
		if (node.y > 0)
			yield this.getNode(node.x, node.y - 1);
		if (node.y < this.cells.length - 1)
			yield this.getNode(node.x, node.y + 1);
	}

	pathToNode(from, to) {
		return pathToRequirement(from, node => to.equals(node));
	}

	pathToRequirement(from, isEnd) {
		const _this = this;
		return aStar({
			start: from,
			neighbors: function *(node, g) { yield* filterGenerator(_this.neighbors(node), n => n.value <= 0 || n.freeIn <= g); },
			isEnd: isEnd,
			distance: (a, b) => a.distance(b),
			heuristic: _ => 0,
			hash: node => node.x + "," + node.y,
		});
	}
}


function handleMove(request, response) {
	const board = new Board(request.body);
	// board.print();

	// const foodBoard = new Board(board.height(), board.width());
	// for (let f of board.food)
	// 	foodBoard.getNode(f.x, f.y).value = 1;
	// foodBoard.print();

	const pathResult = board.pathToRequirement(board.me[0], node => node.value == -1);

	let towardsNode;
	if (pathResult.status == 'success')
		towardsNode = pathResult.path[1];
	else {
		console.warn(pathResult.status);
		towardsNode = maxFromGenerator(filterGenerator(board.neighbors(board.me[0]), n => n.freeIn <= 0), node => board.fillCount(node));
		if (towardsNode == undefined) {
			console.warn("stuck");
			towardsNode = board.me[1];
		}
	}
	const move = board.me[0].direction(towardsNode);
	console.log(`MOVE: ${move}`);
	response.status(200).send({
		move: move,
	});
}

function handleEnd(request, response) {
	console.log('END');
	response.status(200).send('ok');
}
