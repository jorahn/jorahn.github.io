#!/usr/bin/env python3
import json
import csv
try:
    import chess  # type: ignore
    HAVE_CHESS = True
except Exception:
    HAVE_CHESS = False
import subprocess
import tempfile
import os
from pathlib import Path

def get_difficulty_from_rating(rating):
    """Convert chess puzzle rating to difficulty category."""
    if rating < 1000:
        return "beginner"
    elif rating < 1500:
        return "easy"
    elif rating < 2000:
        return "medium"
    elif rating < 2500:
        return "hard"
    else:
        return "expert"

def convert_lichess_puzzles():
    """Convert Lichess puzzle data to our format with sequential evaluation.
    Emits evaluation positions at model turns (i % 2 == 1), like the GDM benchmark
    and the rook reference evaluation.
    """

    positions = []
    seen_puzzles = set()

    def is_plausible_uci(mv: str) -> bool:
        if not mv or len(mv) not in (4, 5):
            return False
        frm = mv[0:2]
        to = mv[2:4]
        promo = mv[4:] if len(mv) == 5 else ''
        files = set('abcdefgh')
        ranks = set('12345678')
        promos = set('nbrq')
        return (frm[0] in files and frm[1] in ranks and to[0] in files and to[1] in ranks and (promo == '' or promo in promos))

    # Decompress the zst file to a temporary file
    print("Decompressing Lichess puzzle data (this may take a while)...")
    with tempfile.NamedTemporaryFile(mode='w+', suffix='.csv', delete=False) as temp_file:
        temp_filename = temp_file.name

    try:
        # Decompress using zstd with force flag
        result = subprocess.run([
            'zstd', '-d', '-f', '/home/jrahn/dev/public/rook/src/data/lichess_db_puzzle.csv.zst',
            '-o', temp_filename
        ], capture_output=True, text=True)

        if result.returncode != 0:
            print(f"zstd error: {result.stderr}")
            return 0

        print("Reading decompressed Lichess data...")
        with open(temp_filename, 'r') as f:
            reader = csv.DictReader(f)

            for i, row in enumerate(reader):
                try:
                    # Lichess format: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
                    fen = row['FEN']
                    moves = row['Moves'].split()
                    if not moves:
                        continue

                    rating = int(row['Rating']) if row['Rating'].isdigit() else 1500
                    themes = row.get('Themes', '').split()
                    popularity = int(row.get('Popularity', 0)) if row.get('Popularity', '').isdigit() else 0
                    puzzle_id = row['PuzzleId']

                    # Sequential evaluation at model turns
                    if HAVE_CHESS:
                        try:
                            board = chess.Board(fen)
                            puzzle_positions = []
                            for idx, mv in enumerate(moves):
                                # CORRECTED: Use same logic as rook code puzzle evaluation
                                # Evaluate at i % 2 == 1 (matches rook eval.py line 83)
                                if idx % 2 == 1:
                                    try:
                                        move_obj = chess.Move.from_uci(mv)
                                        if move_obj in board.legal_moves:
                                            puzzle_positions.append({
                                                "fen": board.fen(),
                                                "correct_move": mv,
                                                "metadata": {
                                                    "puzzle_id": puzzle_id,
                                                    "rating": rating,
                                                    "puzzle_type": "lichess_puzzle",
                                                    "difficulty": get_difficulty_from_rating(rating),
                                                    "source": "lichess",
                                                    "themes": themes[:3],
                                                    "popularity": popularity,
                                                    "solution_sequence": moves,
                                                    "move_index_in_sequence": idx,
                                                    "total_moves_in_sequence": len(moves)
                                                }
                                            })
                                    except Exception:
                                        pass
                                # advance position
                                try:
                                    board.push(chess.Move.from_uci(mv))
                                except Exception:
                                    break
                            if puzzle_positions:
                                positions.extend(puzzle_positions)
                                seen_puzzles.add(puzzle_id)
                        except Exception:
                            pass
                    else:
                        # Fallback: without python-chess, emit only first-move positions (best-effort)
                        first_move = moves[0]
                        if is_plausible_uci(first_move):
                            positions.append({
                                "fen": fen,
                                "correct_move": first_move,
                                "metadata": {
                                    "puzzle_id": puzzle_id,
                                    "rating": rating,
                                    "puzzle_type": "lichess_puzzle",
                                    "difficulty": get_difficulty_from_rating(rating),
                                    "source": "lichess",
                                    "themes": themes[:3],
                                    "popularity": popularity
                                }
                            })
                            seen_puzzles.add(puzzle_id)

                except Exception as e:
                    if i < 10:  # Only print first few errors
                        print(f"Error processing row {i}: {e}")
                    continue

                # Limit to first 1000 puzzles for demo performance
                if len(seen_puzzles) >= 1000:
                    break

                # Progress indicator
                if i % 50000 == 0:
                    print(f"Processed {i} rows, found {len(positions)} eval positions")

    finally:
        # Clean up temp file
        if os.path.exists(temp_filename):
            os.unlink(temp_filename)

    # Create the benchmark file
    benchmark_data = {
        "name": "Lichess Puzzle Benchmark",
        "description": "Tactical puzzle positions from Lichess.org, evaluated at model turns",
        "target_accuracy": 65.0,  # Estimate based on typical puzzle solving rates
        "citation": "Lichess.org puzzle database",
        "source_url": "https://database.lichess.org/",
        "positions": positions
    }

    # Save to our benchmark directory
    Path('benchmarks').mkdir(exist_ok=True)
    with open('benchmarks/lichess_puzzles.json', 'w') as f:
        json.dump(benchmark_data, f, indent=2)

    print(f"Converted {len(positions)} Lichess evaluation positions across {len(seen_puzzles)} puzzles")
    return len(positions)

if __name__ == "__main__":
    convert_lichess_puzzles()
