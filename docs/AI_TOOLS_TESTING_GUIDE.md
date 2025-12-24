# AI Tools Testing Guide

**Date:** 2025-01-20  
**Purpose:** Comprehensive testing guide for all new AI tools  
**Status:** Ready for Testing

---

## Quick Start Testing

### 1. Test Text Processing Tools

#### Test `grep_file` - Search in Files

**Setup:** First create a test file
```
Create a file called test.txt in Desktop with the content:
"Hello world
This is a test file
Testing grep functionality
Hello again
Final line"
```

**Test Cases:**

1. **Basic Search:**
   ```
   Search for "Hello" in ~/Desktop/test.txt
   ```
   **Expected:** Returns lines 1 and 4 with line numbers

2. **Case-Insensitive Search (default):**
   ```
   Search for "hello" in ~/Desktop/test.txt
   ```
   **Expected:** Returns lines 1 and 4 (case-insensitive match)

3. **Case-Sensitive Search:**
   ```
   Search for "Test" case-sensitively in ~/Desktop/test.txt
   ```
   **Expected:** Returns line 3 (only exact case match)

4. **No Matches:**
   ```
   Search for "xyz123" in ~/Desktop/test.txt
   ```
   **Expected:** Returns empty array with match_count: 0

---

#### Test `read_file_lines` - Read Specific Lines

**Test Cases:**

1. **Read First 3 Lines (Head):**
   ```
   Show me the first 3 lines of ~/Desktop/test.txt
   ```
   **Expected:** Returns lines 1-3 with line numbers

2. **Read Last 2 Lines (Tail):**
   ```
   Show me the last 2 lines of ~/Desktop/test.txt
   ```
   **Expected:** Returns last 2 lines with line numbers

3. **Read Line Range:**
   ```
   Show me lines 2 to 4 of ~/Desktop/test.txt
   ```
   **Expected:** Returns lines 2, 3, 4 with line numbers

4. **Read All Lines (no option):**
   ```
   Read all lines from ~/Desktop/test.txt
   ```
   **Expected:** Returns all lines with line numbers

---

#### Test `count_file` - File Statistics

**Test Cases:**

1. **Count Words, Lines, Characters:**
   ```
   Count the words, lines, and characters in ~/Desktop/test.txt
   ```
   **Expected:** Returns:
   - `lines`: 5
   - `words`: ~12-15 (depending on content)
   - `characters`: Total character count
   - `characters_no_spaces`: Characters without spaces

2. **Count Empty File:**
   ```
   Create an empty file called empty.txt in Desktop
   Count ~/Desktop/empty.txt
   ```
   **Expected:** Returns all zeros or minimal counts

---

### 2. Test Path Utility Tools

#### Test `get_filename` - Extract Filename

**Test Cases:**

1. **Basic Filename Extraction:**
   ```
   What is the filename of ~/Desktop/test.txt?
   ```
   **Expected:** Returns `"test.txt"`

2. **Complex Path:**
   ```
   What is the filename of ~/Documents/projects/myfile.json?
   ```
   **Expected:** Returns `"myfile.json"`

3. **Path with No Extension:**
   ```
   What is the filename of ~/Desktop/README?
   ```
   **Expected:** Returns `"README"`

---

#### Test `get_directory` - Extract Directory

**Test Cases:**

1. **Basic Directory Extraction:**
   ```
   What is the directory of ~/Desktop/test.txt?
   ```
   **Expected:** Returns `"~/Desktop"` or `"/wallet/Desktop"`

2. **Nested Path:**
   ```
   What is the directory of ~/Documents/projects/file.txt?
   ```
   **Expected:** Returns `"~/Documents/projects"` or equivalent

3. **Root File:**
   ```
   What is the directory of /file.txt?
   ```
   **Expected:** Returns `"/"`

---

### 3. Test File Operations

#### Test `touch_file` - Create/Update Timestamp

**Test Cases:**

1. **Create New Empty File:**
   ```
   Touch a file called newfile.txt in Desktop
   ```
   **Expected:** 
   - Creates empty file at `~/Desktop/newfile.txt`
   - Returns `existed: false`
   - File appears in Desktop UI immediately

2. **Update Existing File Timestamp:**
   ```
   Touch ~/Desktop/test.txt
   ```
   **Expected:**
   - Updates modified timestamp
   - Returns `existed: true`
   - File shows updated time in UI

3. **Touch Directory (should handle gracefully):**
   ```
   Touch ~/Desktop
   ```
   **Expected:**
   - Returns success with `is_directory: true`
   - Message indicates directories can't have timestamps updated
   - No error thrown

---

### 4. Test Enhanced Existing Tools

#### Test `list_files` - Enhanced Options

**Setup:** Create some test files first
```
Create files in Desktop:
- .hidden.txt (hidden file)
- visible.txt
- another.txt
```

**Test Cases:**

1. **Basic Listing (default):**
   ```
   List files in ~/Desktop
   ```
   **Expected:** Returns files without hidden files (no `.hidden.txt`)

2. **Show Hidden Files:**
   ```
   List all files including hidden ones in ~/Desktop
   ```
   **Expected:** Returns all files including `.hidden.txt`

3. **Detailed Listing:**
   ```
   List files with details in ~/Desktop
   ```
   **Expected:** Returns files with:
   - `is_dir`: true/false
   - `size`: File size in bytes
   - `mime_type`: MIME type
   - `created`: Creation timestamp
   - `modified`: Modification timestamp

4. **Human-Readable Sizes:**
   ```
   List files with human-readable sizes in ~/Desktop
   ```
   **Expected:** Returns sizes as "12.5 KiB", "3.2 MiB" instead of bytes

5. **Combined Options:**
   ```
   List all files with detailed information and human-readable sizes in ~/Desktop
   ```
   **Expected:** Combines all options (hidden + detailed + human-readable)

---

#### Test `create_folder` - Enhanced with create_parents

**Test Cases:**

1. **Create Folder in Existing Directory:**
   ```
   Create a folder called Projects in Desktop
   ```
   **Expected:** Creates `~/Desktop/Projects`

2. **Create Nested Folders (create_parents):**
   ```
   Create a folder at ~/Desktop/Projects/2025/January
   ```
   **Expected:** 
   - Creates all parent directories if they don't exist
   - Creates `~/Desktop/Projects/2025/January`
   - All intermediate folders created automatically

3. **Verify create_parents Works:**
   ```
   Create folder at ~/NewFolder/SubFolder/DeepFolder
   ```
   **Expected:** Creates all three levels of folders

---

## Advanced Testing Scenarios

### Scenario 1: Text Processing Workflow

**Test a complete workflow:**
```
1. Create a file called data.txt in Desktop with content:
   "Line 1: Apple
   Line 2: Banana
   Line 3: Apple
   Line 4: Cherry
   Line 5: Apple"

2. Search for "Apple" in ~/Desktop/data.txt

3. Show me the first 2 lines of ~/Desktop/data.txt

4. Count the words in ~/Desktop/data.txt
```

**Expected Results:**
- Step 2: Returns 3 matches (lines 1, 3, 5)
- Step 3: Returns lines 1-2
- Step 4: Returns word count (~10 words)

---

### Scenario 2: Path Utilities Workflow

**Test path manipulation:**
```
1. Create a file at ~/Documents/projects/src/main.js

2. What is the filename of ~/Documents/projects/src/main.js?

3. What is the directory of ~/Documents/projects/src/main.js?

4. Create a folder in the same directory as main.js
```

**Expected Results:**
- Step 2: Returns `"main.js"`
- Step 3: Returns `"~/Documents/projects/src"` or equivalent
- Step 4: Creates folder in `~/Documents/projects/src/`

---

### Scenario 3: File Management Workflow

**Test file operations:**
```
1. Create a file called original.txt in Desktop with content "Hello"

2. Touch original.txt

3. List files with details in Desktop

4. Get the filename of ~/Desktop/original.txt

5. Count the file ~/Desktop/original.txt
```

**Expected Results:**
- Step 2: Updates timestamp
- Step 3: Shows file with updated modified time
- Step 4: Returns `"original.txt"`
- Step 5: Returns statistics (1 line, 1 word, ~5 characters)

---

## Edge Cases to Test

### Path Edge Cases

Test with various malformed paths (the system should handle these):

1. **Missing Slash:**
   ```
   Create folder ~Desktop/Test
   ```
   **Expected:** Should fix to `~/Desktop/Test`

2. **Colon Instead of Slash:**
   ```
   List files in ~:Desktop
   ```
   **Expected:** Should fix to `~/Desktop`

3. **Leading Slash Before Tilde:**
   ```
   Read file /~Desktop/test.txt
   ```
   **Expected:** Should fix to `~/Desktop/test.txt`

4. **Bare Folder Name:**
   ```
   Create folder MyFolder
   ```
   **Expected:** Should default to `~/Desktop/MyFolder`

---

### Parameter Validation

Test missing/invalid parameters:

1. **Missing Required Parameter:**
   ```
   Search in ~/Desktop/test.txt
   ```
   **Expected:** Error message about missing "pattern" parameter

2. **Missing Path:**
   ```
   Search for "test"
   ```
   **Expected:** Error message about missing "path" parameter

3. **Invalid Range:**
   ```
   Show me lines 100:200 of ~/Desktop/test.txt
   ```
   **Expected:** Error if file has fewer than 100 lines

---

### File Not Found Cases

1. **Read Non-Existent File:**
   ```
   Read ~/Desktop/nonexistent.txt
   ```
   **Expected:** Error message "File not found"

2. **Grep Non-Existent File:**
   ```
   Search for "test" in ~/Desktop/nonexistent.txt
   ```
   **Expected:** Error message "File not found"

3. **Count Non-Existent File:**
   ```
   Count ~/Desktop/nonexistent.txt
   ```
   **Expected:** Error message "File not found"

---

### Directory vs File Cases

1. **Grep on Directory:**
   ```
   Search for "test" in ~/Desktop
   ```
   **Expected:** Error - must be a file, not directory

2. **Read Directory:**
   ```
   Read ~/Desktop
   ```
   **Expected:** Error - must be a file, not directory

3. **Count Directory:**
   ```
   Count ~/Desktop
   ```
   **Expected:** Error - must be a file, not directory

---

## Verification Checklist

### ✅ Functionality Checks

- [ ] `grep_file` finds matching lines correctly
- [ ] `grep_file` case-sensitive option works
- [ ] `read_file_lines` first option works
- [ ] `read_file_lines` last option works
- [ ] `read_file_lines` range option works
- [ ] `count_file` returns accurate counts
- [ ] `get_filename` extracts filename correctly
- [ ] `get_directory` extracts directory correctly
- [ ] `touch_file` creates new empty files
- [ ] `touch_file` updates existing file timestamps
- [ ] `touch_file` handles directories gracefully
- [ ] `list_files` shows/hides hidden files correctly
- [ ] `list_files` detailed option works
- [ ] `list_files` human-readable sizes work
- [ ] `create_folder` creates nested folders automatically

### ✅ Path Handling Checks

- [ ] Malformed paths are fixed automatically
- [ ] Bare folder names default to Desktop
- [ ] Wallet-scoped paths work correctly
- [ ] Relative paths resolve correctly

### ✅ Error Handling Checks

- [ ] Missing parameters show clear error messages
- [ ] File not found shows appropriate error
- [ ] Directory vs file errors are clear
- [ ] Invalid ranges show helpful errors

### ✅ WebSocket Integration Checks

- [ ] `touch_file` shows new files in UI immediately
- [ ] `touch_file` shows updated timestamps in UI
- [ ] Files appear without page refresh
- [ ] No duplicate updates in UI

### ✅ AI Response Checks

- [ ] AI uses correct tool names
- [ ] AI provides natural language responses
- [ ] Tool results are explained clearly
- [ ] AI doesn't use tools for general questions

---

## Sample Test Session

Here's a complete test session you can run:

```
1. "Create a file called sample.txt in Desktop with the content: 'Line 1: Hello\nLine 2: World\nLine 3: Hello\nLine 4: Test'"

2. "Search for 'Hello' in ~/Desktop/sample.txt"

3. "Show me the first 2 lines of ~/Desktop/sample.txt"

4. "Show me the last line of ~/Desktop/sample.txt"

5. "Count the words and lines in ~/Desktop/sample.txt"

6. "What is the filename of ~/Desktop/sample.txt?"

7. "What is the directory containing ~/Desktop/sample.txt?"

8. "Touch ~/Desktop/sample.txt"

9. "List all files with details in Desktop"

10. "Create a folder at ~/Desktop/Projects/2025/January"
```

**Expected Flow:**
- All commands should execute successfully
- Files/folders should appear in UI immediately
- AI should provide natural language responses explaining results
- No errors should occur

---

## Troubleshooting

### If a tool doesn't work:

1. **Check console logs** - Look for error messages
2. **Verify file exists** - Use `list_files` to check
3. **Check path format** - Try using `~/Desktop/` format
4. **Verify parameters** - Make sure all required parameters are provided
5. **Check AI response** - See if AI is using the correct tool name

### Common Issues:

- **"Unknown tool"** - Tool name normalization might be failing
- **"File not found"** - Path might not be resolved correctly
- **"Missing parameter"** - AI might not be providing all required parameters
- **No UI update** - WebSocket event might not be broadcasting

---

## Success Criteria

✅ **All tools work correctly:**
- Text processing tools return accurate results
- Path utilities extract correct information
- File operations complete successfully
- Enhanced options work as expected

✅ **Error handling works:**
- Clear error messages for invalid inputs
- Graceful handling of edge cases
- No crashes or unhandled exceptions

✅ **UI integration works:**
- Files/folders appear immediately
- No page refresh needed
- Timestamps update correctly

✅ **AI behavior is correct:**
- Uses tools for filesystem operations
- Provides natural language responses
- Doesn't use tools for general questions

---

*Happy Testing! 🚀*

