#!/usr/bin/env python3
"""
Convert GDM searchless data to ACTION format for best move accuracy evaluation.
This creates simple FEN → move pairs, not puzzle sequences.
"""

import json
import csv
import chess
from pathlib import Path

def convert_gdm_action():
    """Convert GDM puzzles to simple action format: FEN + single best move."""
    
    positions = []
    
    with open('/home/jrahn/dev/public/rook/src/data/searchless_puzzles.csv', 'r') as f:
        reader = csv.DictReader(f)
        
        for i, row in enumerate(reader):
            try:
                # Get puzzle info
                puzzle_id = row['PuzzleId']
                rating = int(row['Rating']) if row['Rating'].isdigit() else 1500
                base_fen = row['FEN']
                moves_sequence = row['Moves'].split()
                
                # For ACTION evaluation: just use the starting FEN and first move
                # This tests "best move from position" not "puzzle solving"
                if moves_sequence:
                    first_move = moves_sequence[0]
                    
                    # Validate the position and move
                    board = chess.Board(base_fen)
                    try:
                        move = chess.Move.from_uci(first_move)
                        if move in board.legal_moves:
                            position = {
                                "fen": base_fen,
                                "correct_move": first_move,
                                "metadata": {
                                    "puzzle_id": puzzle_id,
                                    "rating": rating,
                                    "puzzle_type": "action_accuracy",
                                    "difficulty": get_difficulty_from_rating(rating),
                                    "source": "gdm_searchless_action",
                                    "evaluation_type": "single_move_accuracy",
                                    "original_sequence": moves_sequence
                                }
                            }
                            positions.append(position)
                    except:
                        continue
                        
            except Exception as e:
                print(f"Error processing puzzle {i}: {e}")
                continue
            
            # Limit for demo performance
            if len(positions) >= 1000:
                break
    
    # Create the benchmark file
    benchmark_data = {
        "name": "GDM Searchless Action Accuracy",
        "description": "Best move accuracy evaluation from GDM searchless chess data. Tests single-position move prediction without puzzle sequences.",
        "target_accuracy": 49.0,
        "citation": "Ruoss et al. 2024. Grandmaster-level chess without search. arXiv:2402.04494",
        "source_url": "https://github.com/google-deepmind/searchless_chess",
        "evaluation_methodology": "Single position → single best move accuracy (no sequences)",
        "evaluation_type": "action",
        "positions": positions
    }
    
    # Save to our benchmark directory
    Path('benchmarks').mkdir(exist_ok=True)
    with open('benchmarks/gdm_action.json', 'w') as f:
        json.dump(benchmark_data, f, indent=2)
    
    print(f"Converted {len(positions)} GDM action accuracy positions")
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
    convert_gdm_action()