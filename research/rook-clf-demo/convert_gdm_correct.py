#!/usr/bin/env python3
"""
Convert ChessBench (Google DeepMind) searchless chess data correctly, following the research evaluation methodology.
The key insight: puzzles have multiple moves, and we need to evaluate the model's ability
to find the correct move at EACH position in the sequence where it's the model's turn to play.
"""

import json
import csv
import chess
import chess.pgn
import io
from pathlib import Path

def process_fen_rook_style(fen):
    """Match the exact FEN processing from the research code."""
    position, turn, castling, en_passant, halfmove, fullmove = fen.split(" ")
    
    # pad position with "." for empty squares, remove numbers and "/"
    import re
    position = re.sub(r'\d', lambda m: '.' * int(m.group()), position)
    position = position.replace("/", "")
    
    # left pad castling with "." for 4 characters (ljust, not padEnd!)
    castling = castling.ljust(4, ".")
    
    # left pad en_passant with "." for 2 characters  
    en_passant = en_passant.ljust(2, ".")
    
    # left pad halfmove with "." for 2 characters + add "."
    halfmove = halfmove.ljust(2, ".") + "."
    
    # left pad fullmove with "." for 3 characters
    fullmove = fullmove.ljust(3, ".")
    
    return "".join([position, turn, castling, en_passant, halfmove, fullmove])

def convert_gdm_puzzles_correct():
    """Convert ChessBench puzzles following the research evaluation methodology."""
    
    positions = []
    seen_puzzles = set()
    
    with open('/home/jrahn/dev/public/rook/src/data/searchless_puzzles.csv', 'r') as f:
        reader = csv.DictReader(f)
        
        for i, row in enumerate(reader):
            try:
                # Get puzzle info
                puzzle_id = row['PuzzleId']
                rating = int(row['Rating']) if row['Rating'].isdigit() else 1500
                pgn_text = row['PGN']
                solution = row['Solution']
                base_fen = row['FEN']
                moves_sequence = row['Moves'].split()
                
                # Parse the PGN to get the game context
                game = chess.pgn.read_game(io.StringIO(pgn_text))
                board = game.board()
                
                # Play through the PGN moves to reach the position
                for move in game.mainline_moves():
                    board.push(move)
                
                # Verify we're at the expected position
                if board.fen() != base_fen:
                    print(f"FEN mismatch in puzzle {puzzle_id}")
                    continue
                
                # Now extract evaluation positions from the solution sequence
                # Following the research methodology: evaluate every other move (when it's the model's turn)
                current_board = chess.Board(base_fen)
                
                puzzle_positions = []
                for move_idx, move_uci in enumerate(moves_sequence):
                    # The research code evaluates on moves where i % 2 == 1
                    # This means the second move, fourth move, etc. in the sequence
                    if move_idx % 2 == 1:
                        # This is a position where we evaluate the model
                        eval_position = {
                            "fen": current_board.fen(),
                            "correct_move": move_uci,
                            "metadata": {
                                "puzzle_id": puzzle_id,
                                "rating": rating,
                                "puzzle_type": "tactical_sequence",
                                "difficulty": get_difficulty_from_rating(rating),
                                "source": "gdm_searchless", 
                                "solution_sequence": moves_sequence,
                                "move_index_in_sequence": move_idx,
                                "total_moves_in_sequence": len(moves_sequence),
                                "solution_description": solution
                            }
                        }
                        
                        # Validate that the move is legal
                        try:
                            move = chess.Move.from_uci(move_uci)
                            if move in current_board.legal_moves:
                                puzzle_positions.append(eval_position)
                        except:
                            continue
                    
                    # Make the move to advance to next position
                    try:
                        move = chess.Move.from_uci(move_uci)
                        current_board.push(move)
                    except:
                        break
                        
                # At end of puzzle, record positions if we found any eval steps
                if puzzle_positions:
                    positions.extend(puzzle_positions)
                    seen_puzzles.add(puzzle_id)

            except Exception as e:
                print(f"Error processing puzzle {i}: {e}")
                continue
            
            # Limit for demo performance: by number of puzzles, not positions
            if len(seen_puzzles) >= 1000:
                break
    
    # Create the benchmark file
    benchmark_data = {
        "name": "ChessBench Puzzles (Research Methodology)",
        "description": "Puzzle sequence evaluation matching the research paper methodology - evaluates model's move prediction at each decision point",
        "target_accuracy": 49.0,
        "citation": "Ruoss et al. 2024. Grandmaster-level chess without search. arXiv:2402.04494",
        "source_url": "https://github.com/google-deepmind/searchless_chess",
        "evaluation_methodology": "Evaluates every other move in puzzle sequences (when model is to play)",
        "positions": positions
    }
    
    # Save to our benchmark directory
    Path('benchmarks').mkdir(exist_ok=True)
    with open('benchmarks/gdm_searchless.json', 'w') as f:
        json.dump(benchmark_data, f, indent=2)
    
    print(f"Converted {len(positions)} ChessBench evaluation positions across {len(seen_puzzles)} puzzles using research methodology")
    return len(positions)

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

if __name__ == "__main__":
    convert_gdm_puzzles_correct()
