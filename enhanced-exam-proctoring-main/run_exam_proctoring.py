"""
Main runner for the Enhanced Exam Proctoring System
"""
import os
import sys


def print_menu():
    print("\n" + "="*60)
    print("Enhanced Exam Proctoring System")
    print("="*60)
    print("\nOptions:")
    print("1. Record New Exam")
    print("2. Analyze Recorded Exam")
    print("3. Record and Analyze")
    print("4. View Reports")
    print("5. Exit")
    print("="*60)


def record_exam():
    """Record exam session"""
    print("\nStarting exam recording...\n")
    os.system('python capture_exam.py')


def analyze_exam():
    """Analyze recorded exam"""
    print("\nStarting exam analysis...\n")
    os.system('python analyze_cheating.py')


def record_and_analyze():
    """Record and then analyze"""
    record_exam()
    print("\n" + "="*60)
    input("Press Enter to continue to analysis...")
    analyze_exam()


def view_reports():
    """Show available reports"""
    print("\n" + "="*60)
    print("Available Reports")
    print("="*60 + "\n")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    outputs_dir = os.path.join(script_dir, 'outputs')
    if not os.path.exists(outputs_dir):
        print("No reports found")
        return
    
    files = os.listdir(outputs_dir)
    
    videos = [f for f in files if f.endswith('.mp4')]
    reports = [f for f in files if f.endswith('.xlsx')]
    
    if videos:
        print("Videos:")
        for v in videos:
            print(f"  - {v}")
    
    if reports:
        print("\nReports:")
        for r in reports:
            print(f"  - {r}")
    
    if not videos and not reports:
        print("No reports found")


def main():
    while True:
        print_menu()
        choice = input("\nChoose option (1-5): ").strip()
        
        if choice == '1':
            record_exam()
        elif choice == '2':
            analyze_exam()
        elif choice == '3':
            record_and_analyze()
        elif choice == '4':
            view_reports()
        elif choice == '5':
            print("\nThank you for using the system!")
            break
        else:
            print("\nInvalid option")
        
        input("\nPress Enter to continue...")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nProgram stopped")
        sys.exit(0)
