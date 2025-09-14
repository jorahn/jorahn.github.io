#!/usr/bin/env python3
"""
Convert benchmark data from the rook evaluation files to our demo JSON format.
"""

import json
import csv
import chess
import chess.pgn
import io
from pathlib import Path

def convert_bigbench_checkmate():
    """Convert Big-Bench checkmate data to our format."""
    
    # Load the Big-Bench data
    with open('/home/jrahn/dev/public/rook/src/data/checkmate.json', 'r') as f:
        data = json.load(f)
    
    positions = []
    
    for example in data['examples']:
        try:
            # Parse the PGN to get the final position
            game = chess.pgn.read_game(io.StringIO(example['input']))
            board = game.board()
            
            # Play through all moves to get final position
            for move in game.mainline_moves():
                board.push(move)
            
            # Parse the target move to get UCI format
            target_move = board.parse_san(example['target'])
            
            position = {
                "fen": board.fen(),
                "correct_move": target_move.uci(),
                "metadata": {
                    "puzzle_type": "checkmate_in_one",
                    "difficulty": "varies",
                    "source": "big_bench",
                    "target_san": example['target']
                }
            }
            
            positions.append(position)
            
        except Exception as e:
            print(f"Error processing example: {e}")
            continue
    
    # Create the benchmark file
    benchmark_data = {
        "name": "Big-Bench Checkmate-in-One Benchmark",
        "description": "Checkmate puzzle positions from Google Big-Bench suite for evaluating tactical chess ability",
        "target_accuracy": 57.0,
        "citation": "Srivastava et al. 2023. Beyond the Imitation Game: Quantifying and extrapolating the capabilities of language models. Trans. Mach. Learn. Res.",
        "source_url": "https://github.com/google/BIG-bench/tree/main/bigbench/benchmark_tasks/checkmate_in_one",
        "positions": positions
    }
    
    # Save to our benchmark directory
    with open('benchmarks/bigbench_checkmate.json', 'w') as f:
        json.dump(benchmark_data, f, indent=2)
    
    print(f"Converted {len(positions)} Big-Bench checkmate positions")
    return len(positions)

def convert_gdm_puzzles():
    """Convert Google DeepMind searchless chess puzzles to our format."""
    
    positions = []
    
    # Read the CSV file
    with open('/home/jrahn/dev/public/rook/src/data/searchless_puzzles.csv', 'r') as f:
        reader = csv.DictReader(f)
        
        for i, row in enumerate(reader):
            try:
                # The CSV has columns: PuzzleId, Rating, PGN, Solution, FEN, Moves
                fen = row['FEN']
                moves = row['Moves'].split()
                
                # The first move in the solution is the best move
                if moves:
                    correct_move = moves[0]
                    
                    # Validate the position and move
                    board = chess.Board(fen)
                    try:
                        move = chess.Move.from_uci(correct_move)
                        if move in board.legal_moves:
                            position = {
                                "fen": fen,
                                "correct_move": correct_move,
                                "metadata": {
                                    "puzzle_id": row['PuzzleId'],
                                    "rating": int(row['Rating']) if row['Rating'].isdigit() else 0,
                                    "puzzle_type": "tactical_puzzle",
                                    "difficulty": get_difficulty_from_rating(int(row['Rating']) if row['Rating'].isdigit() else 1500),
                                    "source": "gdm_searchless",
                                    "solution": row['Solution']
                                }
                            }
                            positions.append(position)
                    except:
                        continue
                        
            except Exception as e:
                print(f"Error processing row {i}: {e}")
                continue
            
            # Limit to first 1000 for demo performance
            if len(positions) >= 1000:
                break
    
    # Create the benchmark file
    benchmark_data = {
        "name": "Google DeepMind Searchless Chess Benchmark",
        "description": "Benchmark positions from 'Grandmaster-level chess without search' paper for evaluating best move accuracy",
        "target_accuracy": 49.0,
        "citation": "Ruoss et al. 2024. Grandmaster-level chess without search. arXiv:2402.04494",
        "source_url": "https://github.com/google-deepmind/searchless_chess",
        "positions": positions
    }
    
    # Save to our benchmark directory
    with open('benchmarks/gdm_searchless.json', 'w') as f:
        json.dump(benchmark_data, f, indent=2)
    
    print(f"Converted {len(positions)} GDM searchless positions")
    return len(positions)

def convert_lichess_puzzles():
    """Convert Lichess puzzle data to our format."""
    
    import subprocess
    import tempfile
    import os
    
    positions = []
    
    # Decompress the zst file to a temporary file
    print("Decompressing Lichess puzzle data...")
    with tempfile.NamedTemporaryFile(mode='w+', suffix='.csv', delete=False) as temp_file:
        temp_filename = temp_file.name
    
    try:
        # Decompress using zstd
        subprocess.run([
            'zstd', '-d', '-f', '/home/jrahn/dev/public/rook/src/data/lichess_db_puzzle.csv.zst', 
            '-o', temp_filename
        ], check=True)
        
        print("Reading decompressed Lichess data...")
        with open(temp_filename, 'r') as f:
            reader = csv.DictReader(f)
            
            for i, row in enumerate(reader):
                try:
                    # Lichess format: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
                    fen = row['FEN']
                    moves = row['Moves'].split()
                    
                    # First move is the correct solution
                    if moves:
                        correct_move = moves[0]
                        
                        # Validate the position and move
                        board = chess.Board(fen)
                        try:
                            move = chess.Move.from_uci(correct_move)
                            if move in board.legal_moves:
                                rating = int(row['Rating']) if row['Rating'].isdigit() else 1500
                                themes = row.get('Themes', '').split()
                                
                                position = {
                                    "fen": fen,
                                    "correct_move": correct_move,
                                    "metadata": {
                                        "puzzle_id": row['PuzzleId'],
                                        "rating": rating,
                                        "puzzle_type": "lichess_puzzle",
                                        "difficulty": get_difficulty_from_rating(rating),
                                        "source": "lichess",
                                        "themes": themes[:3],  # Limit themes for size
                                        "popularity": int(row.get('Popularity', 0)) if row.get('Popularity', '').isdigit() else 0
                                    }
                                }
                                positions.append(position)
                        except:
                            continue
                            
                except Exception as e:
                    if i < 10:  # Only print first few errors
                        print(f"Error processing row {i}: {e}")
                    continue
                
                # Limit to first 1000 for demo performance
                if len(positions) >= 1000:
                    break
                
                # Progress indicator
                if i % 10000 == 0:
                    print(f"Processed {i} rows, found {len(positions)} valid positions")
    
    finally:
        # Clean up temp file
        if os.path.exists(temp_filename):
            os.unlink(temp_filename)
    
    # Create the benchmark file
    benchmark_data = {
        "name": "Lichess Puzzle Benchmark",
        "description": "Tactical puzzle positions from Lichess.org for evaluating chess tactical ability",
        "target_accuracy": 65.0,  # Estimate based on typical puzzle solving rates
        "citation": "Lichess.org puzzle database",
        "source_url": "https://database.lichess.org/",
        "positions": positions
    }
    
    # Save to our benchmark directory
    with open('benchmarks/lichess_puzzles.json', 'w') as f:
        json.dump(benchmark_data, f, indent=2)
    
    print(f"Converted {len(positions)} Lichess puzzle positions")
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
    print("Converting benchmark data...")
    
    # Ensure benchmark directory exists
    Path('benchmarks').mkdir(exist_ok=True)
    
    # Convert all three benchmarks
    print("\n1. Converting Big-Bench Checkmate data...")
    bigbench_count = convert_bigbench_checkmate()
    
    print("\n2. Converting GDM Searchless Chess data...")
    gdm_count = convert_gdm_puzzles()
    
    print("\n3. Converting Lichess Puzzle data...")
    lichess_count = convert_lichess_puzzles()
    
    print(f"\nConversion complete:")
    print(f"- Big-Bench Checkmate: {bigbench_count} positions")
    print(f"- GDM Searchless: {gdm_count} positions")
    print(f"- Lichess Puzzles: {lichess_count} positions")
    print(f"\nTotal: {bigbench_count + gdm_count + lichess_count} benchmark positions")