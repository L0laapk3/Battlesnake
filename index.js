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
		color: '#' + Math.floor(Math.random()*(1<<24)).toString(16),
		head: 'ski',
		tail: 'hook'
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
			this.prediction = 0;
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
				if (cell < snake.length - 1 || true)
					snake[cellI].freeIn = Math.max(snake[cellI].freeIn, snakeResponse.body.length - cellI - 1);
			}
		}
		for (let snake of this.snakes) {
			if (snake != this.me && snake.length >= this.me.length)
				for (let neighbor of this.neighbors(snake[0]))
					if (neighbor.freeIn <= 0) {
						neighbor.freeIn = response.game.ruleset == 'constrictor' ? 1E8 : snake.length;
						neighbor.prediction = 2 + 2 * (snake.length > this.me.length) + (neighbor.value != 0);
					}
		}
	}

	castRay(node, direction) {
		const x = direction.x - node.x, y = direction.y - node.y;
		while (direction.freeIn == 0) {
			direction = this.getNodeOob(direction.x + x, direction.y + y);
			if (!direction)
				return undefined;
		}
		return direction;
	}

	fillCount(node, g) {
		g = g || 0;
		// TODO: faster
		const nodes = [];
		let unexplored, nextUnexplored = [node];
		while (nextUnexplored.length) {
			unexplored = nextUnexplored;
			nextUnexplored = [];
			while (unexplored.length) {
				const node = unexplored.pop();
				for (let neighbor of this.neighbors(node))
					if (neighbor.freeIn <= g && nodes.indexOf(neighbor) == -1 && nextUnexplored.indexOf(neighbor) == -1)
						nextUnexplored.push(neighbor);
				nodes.push(node);
			}
			g++;
		}

		return nodes.length;
	}

	height() {
		return this.cells.length;
	}
	width() {
		return this.cells[0].length;
	}

	getNodeOob(x, y) {
		if (x >= 0 && x < this.cells[0].length && y >= 0 && y < this.cells.length)
			return this.cells[y][x];
		return undefined;
	}

	getNode(x, y) {
		const node = this.getNodeOob(x, y);
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
				let bottomCell = row >= 0 && (leftRightBorder || row == 0 || this.cells[row-1][c].freeIn > 0);
				if (leftRightBorder || row == this.cells.length || row < 0 || this.cells[row][c].freeIn > 0) {
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

	sssp(from, isEnd) {
		const reconstructPath = node => {
			while (node.g > 0) {
				node = node.parents[0];
			}
			return node.node;
		};
		let evenNodes = [ { node: from, g: 0, parents: [] } ], oddNodes = [], oddI = 0, cost = 0;
		while (true) {
			let i = oddI;
			if (i >= evenNodes.length)
				return undefined;
			oddI = oddNodes.length;
			for (; i < evenNodes.length; i++) {
				neighbors:
				for (const neighbor of this.neighbors(evenNodes[i].node)) {
					if (neighbor.freeIn > cost)
						continue;
					if (isEnd(neighbor, cost + 1))
						return reconstructPath({ node: neighbor, g: cost, parents: [evenNodes[i]] });
					for (let otherI = 0; otherI < oddNodes.length; otherI++)
						if (oddNodes[otherI].node == neighbor) {
							if (otherI >= oddI)
								oddNodes[otherI].parents.push(evenNodes[i]);
							continue neighbors;
						}
					oddNodes.push({ node: neighbor, g: cost, parents: [evenNodes[i]] });
				}
			}
			[ evenNodes, oddNodes ] = [ oddNodes, evenNodes ];
			cost++;
		}
	}
}


function handleMove(request, response) {
	const board = new Board(request.body);
	// board.print();

	// const foodBoard = new Board(board.height(), board.width());
	// for (let f of board.food)
	// 	foodBoard.getNode(f.x, f.y).value = 1;
	// foodBoard.print();


	// const fillBoard = new Board(board.height(), board.width());
	// let towardsNode = board.sssp(board.me[0], node => { fillBoard.getNode(node.x, node.y).freeIn = 1; return node.value == -1; });
	// fillBoard.print();
	let towardsNode, predictionLevel = 0;
	while (true) {
		towardsNode = board.sssp(board.me[0], (node, g) => node.value == -1 && board.fillCount(node, g - 1) >= board.width() * board.height() * 0.2);
		if (!towardsNode)
			towardsNode = maxFromGenerator(filterGenerator(board.neighbors(board.me[0]), n => n.freeIn <= 0), node => board.fillCount(node) * 1E9 + (board.castRay(board.me[0], node) || {freeIn: 1E8}).freeIn);
		if (towardsNode)
			break;
		// remove move prediction of equal length first and then larger length snakes, each time first the squares without food and then with food
		if (predictionLevel++ == 4) {
			console.warn("stuck");
			towardsNode = board.me[1];
			break;
		}
		for (const row of board.cells)
			for (const node of row)
				if (node.prediction == predictionLevel)
					node.freeIn = 0;
	}
	if (predictionLevel > 0)
		console.warn(`no path (${predictionLevel})`);
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
