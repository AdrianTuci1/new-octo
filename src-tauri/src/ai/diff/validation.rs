use derivative::Derivative;
use itertools::{EitherOrBoth, Itertools};
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    cmp::Ordering,
    fmt::{self, Display},
    ops::Range,
    path::PathBuf,
    sync::LazyLock,
};
use strsim::jaro_winkler;

lazy_static! {
    /// Regex to parse a line number from a string in the format "{number}|{line}"
    static ref LINE_NUMBER_PARSE: Regex = Regex::new(r"^(\d+)\|(.*)$").expect("Regex is valid");
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind")]
pub enum ParsedDiff {
    #[serde(rename = "str_replace")]
    StrReplaceEdit {
        file: Option<String>,
        search: Option<String>,
        replace: Option<String>,
    },
    #[serde(rename = "v4a")]
    V4AEdit {
        file: Option<String>,
        move_to: Option<String>,
        hunks: Vec<V4AHunk>,
    },
}

impl ParsedDiff {
    pub fn file(&self) -> Option<&String> {
        match self {
            ParsedDiff::StrReplaceEdit { file, .. } => file.as_ref(),
            ParsedDiff::V4AEdit { file, .. } => file.as_ref(),
        }
    }
}

impl Display for ParsedDiff {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParsedDiff::StrReplaceEdit {
                file,
                search,
                replace,
            } => {
                write!(
                    f,
                    "{}",
                    json!({ "file": file, "search": search, "replace": replace})
                )
            }
            ParsedDiff::V4AEdit {
                file,
                move_to,
                hunks,
            } => {
                write!(
                    f,
                    "{}",
                    json!({
                        "file": file,
                        "move_to": move_to,
                        "hunks": hunks
                    })
                )
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind")]
pub enum DiffType {
    #[serde(rename = "create")]
    Create { delta: DiffDelta },
    #[serde(rename = "update")]
    Update {
        deltas: Vec<DiffDelta>,
        rename: Option<PathBuf>,
    },
    #[serde(rename = "delete")]
    Delete { delta: DiffDelta },
}

impl DiffType {
    pub fn creation(content: String) -> Self {
        DiffType::Create {
            delta: DiffDelta {
                replacement_line_range: 0..0,
                insertion: content,
            },
        }
    }

    pub fn deletion(num_lines: usize) -> Self {
        DiffType::Delete {
            delta: DiffDelta {
                replacement_line_range: 1..num_lines.saturating_add(1),
                insertion: String::new(),
            },
        }
    }

    pub fn update(deltas: Vec<DiffDelta>, rename_to: Option<String>) -> Self {
        DiffType::Update {
            deltas,
            rename: rename_to.map(Into::into),
        }
    }
}

#[derive(Debug, Clone, Derivative, Serialize, Deserialize)]
#[derivative(Eq, PartialEq)]
pub struct AIRequestedCodeDiff {
    pub file_name: String,
    pub diff_type: DiffType,
    #[derivative(PartialEq = "ignore")]
    pub failures: Option<DiffMatchFailures>,
    #[derivative(PartialEq = "ignore")]
    pub original_content: String,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffDelta {
    pub replacement_line_range: Range<usize>,
    pub insertion: String,
}

impl fmt::Debug for DiffDelta {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "DiffDelta {{ replacement_line_range: {:?}, insertion: {:?} }}",
            &self.replacement_line_range, &self.insertion
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchAndReplace {
    pub search: String,
    pub replace: String,
}

impl TryFrom<ParsedDiff> for SearchAndReplace {
    type Error = ();

    fn try_from(diff: ParsedDiff) -> Result<Self, Self::Error> {
        match diff {
            ParsedDiff::StrReplaceEdit {
                search: None,
                replace: None,
                ..
            } => Err(()),
            ParsedDiff::StrReplaceEdit {
                search, replace, ..
            } => Ok(SearchAndReplace {
                search: search.unwrap_or_default(),
                replace: remove_extra_line_num_prefix(replace.unwrap_or_default()),
            }),
            ParsedDiff::V4AEdit { .. } => Err(()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct V4AHunk {
    pub change_context: Vec<String>,
    pub pre_context: String,
    pub old: String,
    pub new: String,
    pub post_context: String,
}

fn lines(s: &str) -> impl Iterator<Item = &str> {
    match s {
        "" => "\n".lines(),
        _ => s.lines(),
    }
}

fn is_strict_trimmed_prefix(search: &str, file_line: &str) -> bool {
    let trimmed_search = search.trim_start();
    let trimmed_file = file_line.trim_start();
    !trimmed_search.is_empty()
        && trimmed_file.len() > trimmed_search.len()
        && trimmed_file.starts_with(trimmed_search)
}

fn unmatched_line_suffix<'a>(search_line: &str, file_line: &'a str) -> Option<&'a str> {
    if is_strict_trimmed_prefix(search_line, file_line) {
        let trimmed_search = search_line.trim_start();
        let trimmed_file = file_line.trim_start();
        Some(&trimmed_file[trimmed_search.len()..])
    } else {
        None
    }
}

fn remove_extra_line_num_prefix(replace: String) -> String {
    lazy_static! {
        static ref LINE_NUMBER_PATTERN: Regex =
            Regex::new(r"^\d+\|").expect("line number regex must compile");
    }

    lines(&replace)
        .map(|line| LINE_NUMBER_PATTERN.replace(line, "").into_owned())
        .join("\n")
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct DiffMatchFailures {
    pub fuzzy_match_failures: u8,
    pub noop_deltas: u8,
    pub missing_line_numbers: u8,
}

pub fn fuzzy_match_diffs(
    file_name: &str,
    diffs: &[SearchAndReplace],
    file_content: impl Into<String>,
) -> AIRequestedCodeDiff {
    let file_content = file_content.into();
    let (deltas, failures) = fuzzy_match_file_diffs(diffs, &file_content);

    let update_deltas_empty = deltas.is_empty();
    let failures = if failures.fuzzy_match_failures > 0
        || failures.missing_line_numbers > 0
        || (failures.noop_deltas > 0 && update_deltas_empty)
    {
        Some(failures)
    } else {
        None
    };

    AIRequestedCodeDiff {
        file_name: file_name.into(),
        diff_type: DiffType::Update {
            deltas,
            rename: None,
        },
        failures,
        original_content: file_content,
    }
}

pub fn fuzzy_match_v4a_diffs(
    file_name: &str,
    diffs: &[V4AHunk],
    rename_to: Option<String>,
    file_content: impl Into<String>,
) -> AIRequestedCodeDiff {
    let file_content = file_content.into();
    let mut deltas = Vec::new();
    let mut failures = DiffMatchFailures::default();

    let file_lines: Vec<&str> = file_content.lines().collect();

    for diff in diffs {
        if diff.old == diff.new {
            failures.noop_deltas += 1;
            continue;
        }

        let match_range = find_v4a_match(diff, &file_lines);

        match match_range {
            Some(range) => {
                let matched_content = file_lines[range.start - 1..range.end - 1].join("\n");
                if diff.new == matched_content {
                    failures.noop_deltas += 1;
                    continue;
                }

                deltas.push(DiffDelta {
                    replacement_line_range: range.start..range.end,
                    insertion: diff.new.clone(),
                });
            }
            None => {
                failures.fuzzy_match_failures += 1;
            }
        }
    }

    let update_deltas_empty = deltas.is_empty();
    let failures = if failures.fuzzy_match_failures > 0
        || failures.missing_line_numbers > 0
        || (failures.noop_deltas > 0 && update_deltas_empty)
    {
        Some(failures)
    } else {
        None
    };

    AIRequestedCodeDiff {
        file_name: file_name.into(),
        diff_type: DiffType::update(deltas, rename_to),
        failures,
        original_content: file_content,
    }
}

fn fuzzy_match_file_diffs(
    diffs: &[SearchAndReplace],
    file_content: &str,
) -> (Vec<DiffDelta>, DiffMatchFailures) {
    let mut deltas = Vec::new();
    let mut failures = DiffMatchFailures::default();

    let target_lines: Vec<&str> = lines(file_content).collect();

    for diff in diffs {
        let (mut line_range, search) = parse_line_numbers(&diff.search);

        if line_range.is_none() && !search.is_empty() {
            failures.missing_line_numbers += 1;
        }

        if search == diff.replace {
            failures.noop_deltas += 1;
            continue;
        }

        let fuzzy_match_line_numbers = if line_range == Some(0..0) {
            line_range
        } else {
            line_range = line_range.filter(|range| {
                range.start > 0
                    && range.start <= target_lines.len()
                    && range.end > 0
                    && range.end <= target_lines.len() + 1
                    && range.end >= range.start
            });

            let mut matched = match_diff(
                &search,
                line_range.clone(),
                &target_lines,
                SECTION_MATCH_THRESHOLD,
                MakeExactMatch,
            )
            .or_else(|| {
                match_diff(
                    &search,
                    line_range.clone(),
                    &target_lines,
                    SECTION_MATCH_THRESHOLD,
                    MakeIndentationAgnosticMatch,
                )
            });

            if matched.is_none() && line_range.is_some() {
                matched = match_diff(
                    &search,
                    line_range.clone(),
                    &target_lines,
                    1.0,
                    MakePrefixTailMatch,
                );
            }

            if matched.is_none() {
                matched = match_diff(
                    &search,
                    line_range.clone(),
                    &target_lines,
                    SECTION_MATCH_THRESHOLD,
                    MakeJaroWinklerMatch,
                );
            }

            matched
        };

        match fuzzy_match_line_numbers {
            Some(range) => {
                if range != (0..0)
                    && diff
                        .replace
                        .lines()
                        .zip_longest(&target_lines[range.start - 1..range.end - 1])
                        .all(|pair| match pair {
                            EitherOrBoth::Both(replace, original) => replace == *original,
                            EitherOrBoth::Left(_) | EitherOrBoth::Right(_) => false,
                        })
                {
                    failures.noop_deltas += 1;
                    continue;
                }

                let mut insertion = diff.replace.clone();
                if range.end >= 2 && lines(&search).count() == lines(&insertion).count() {
                    if let Some(suffix) = lines(&search)
                        .last()
                        .and_then(|last| unmatched_line_suffix(last, target_lines[range.end - 2]))
                    {
                        insertion.push_str(suffix);
                    }
                }
                deltas.push(DiffDelta {
                    replacement_line_range: range.start..range.end,
                    insertion,
                });
            }
            None => {
                failures.fuzzy_match_failures += 1;
            }
        }
    }

    (deltas, failures)
}

#[derive(Debug, PartialEq)]
pub struct Match {
    pub start_line: usize,
    pub end_line: usize,
    pub similarity: f64,
}

fn score_matches<T: Scorer>(
    target_lines: &[&str],
    search_window_lines: usize,
    threshold: f64,
    expected_range: Option<Range<usize>>,
    scorer: &T,
) -> Vec<Match> {
    if search_window_lines == 0 || search_window_lines > target_lines.len() {
        return Vec::new();
    }

    let mut matches = Vec::new();
    for (i, window) in target_lines.windows(search_window_lines).enumerate() {
        let similarity = scorer.score(window);
        if similarity >= threshold {
            matches.push(Match {
                start_line: i + 1,
                end_line: i + search_window_lines + 1,
                similarity,
            });
        }
    }

    matches.sort_by(move |a, b| {
        let by_similarity = a
            .similarity
            .partial_cmp(&b.similarity)
            .unwrap_or(Ordering::Equal)
            .reverse();
        if let Some(Range { start, .. }) = expected_range {
            by_similarity.then_with(|| {
                let a_distance = a.start_line.abs_diff(start);
                let b_distance = b.start_line.abs_diff(start);
                a_distance.cmp(&b_distance)
            })
        } else {
            by_similarity
        }
    });

    matches
}

trait Scorer: fmt::Display {
    fn score(&self, target_lines: &[&str]) -> f64;
}

trait MakeScorer: fmt::Display {
    type ScorerInstance<'a>: Scorer;
    fn for_search<'a>(&self, search_text: &'a str) -> Self::ScorerInstance<'a>;
}

struct ExactMatch<'a> {
    search_lines: Vec<&'a str>,
}

impl<'a> ExactMatch<'a> {
    fn new(search_text: &'a str) -> Self {
        let search_lines = lines(search_text).collect();
        Self { search_lines }
    }
}

impl Scorer for ExactMatch<'_> {
    fn score(&self, target_lines: &[&str]) -> f64 {
        if target_lines == self.search_lines {
            1.0
        } else {
            0.0
        }
    }
}

impl fmt::Display for ExactMatch<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{MakeExactMatch}")
    }
}

#[derive(Clone)]
struct MakeExactMatch;

impl fmt::Display for MakeExactMatch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Exact")
    }
}

impl MakeScorer for MakeExactMatch {
    type ScorerInstance<'a> = ExactMatch<'a>;

    fn for_search<'a>(&self, search_text: &'a str) -> Self::ScorerInstance<'a> {
        ExactMatch::new(search_text)
    }
}

struct IndentationAgnosticMatch<'a> {
    search_lines: Vec<&'a str>,
}

impl<'a> IndentationAgnosticMatch<'a> {
    fn new(search_text: &'a str) -> Self {
        let search_lines = lines(search_text).map(|line| line.trim_start()).collect();
        Self { search_lines }
    }
}

impl Scorer for IndentationAgnosticMatch<'_> {
    fn score(&self, target_lines: &[&str]) -> f64 {
        if target_lines
            .iter()
            .map(|line| line.trim_start())
            .zip(self.search_lines.iter())
            .all(|(a, b)| a == *b)
        {
            1.0
        } else {
            0.0
        }
    }
}

impl fmt::Display for IndentationAgnosticMatch<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{MakeIndentationAgnosticMatch}")
    }
}

#[derive(Clone)]
struct MakeIndentationAgnosticMatch;

impl fmt::Display for MakeIndentationAgnosticMatch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Indentation Agnostic")
    }
}

impl MakeScorer for MakeIndentationAgnosticMatch {
    type ScorerInstance<'a> = IndentationAgnosticMatch<'a>;

    fn for_search<'a>(&self, search_text: &'a str) -> Self::ScorerInstance<'a> {
        IndentationAgnosticMatch::new(search_text)
    }
}

struct PrefixTailMatch<'a> {
    search_lines: Vec<&'a str>,
}

impl<'a> PrefixTailMatch<'a> {
    fn new(search_text: &'a str) -> Self {
        let search_lines = lines(search_text).map(|line| line.trim_start()).collect();
        Self { search_lines }
    }
}

impl Scorer for PrefixTailMatch<'_> {
    fn score(&self, target_lines: &[&str]) -> f64 {
        if target_lines.len() != self.search_lines.len() || self.search_lines.is_empty() {
            return 0.0;
        }

        let last_idx = self.search_lines.len() - 1;

        let prefix_lines_exact = self.search_lines[..last_idx]
            .iter()
            .zip(&target_lines[..last_idx])
            .all(|(s, t)| *s == t.trim_start());
        if !prefix_lines_exact {
            return 0.0;
        }

        if is_strict_trimmed_prefix(self.search_lines[last_idx], target_lines[last_idx]) {
            1.0
        } else {
            0.0
        }
    }
}

impl fmt::Display for PrefixTailMatch<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{MakePrefixTailMatch}")
    }
}

#[derive(Clone)]
struct MakePrefixTailMatch;

impl fmt::Display for MakePrefixTailMatch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Prefix Tail")
    }
}

impl MakeScorer for MakePrefixTailMatch {
    type ScorerInstance<'a> = PrefixTailMatch<'a>;

    fn for_search<'a>(&self, search_text: &'a str) -> Self::ScorerInstance<'a> {
        PrefixTailMatch::new(search_text)
    }
}

const SECTION_MATCH_THRESHOLD: f64 = 0.9;

fn match_diff<S: MakeScorer>(
    search: &str,
    line_range: Option<Range<usize>>,
    file_content: &[&str],
    threshold: f64,
    factory: S,
) -> Option<Range<usize>> {
    let search_length = lines(search).count();
    let scorer = factory.for_search(search);

    if let Some(Range { start, end }) = &line_range {
        let search_start = start.saturating_sub(2);
        let search_end = (end + 2).min(file_content.len());
        if search_start <= search_end {
            let local_lines = &file_content[search_start..search_end];
            let local_matches = score_matches(
                local_lines,
                search_length,
                threshold,
                line_range
                    .clone()
                    .map(|range| range.start - search_start..range.end - search_start),
                &scorer,
            );
            if let Some(local_match) = local_matches.first() {
                let local_start = local_match.start_line + search_start;
                let local_end = local_match.end_line + search_start;
                return Some(local_start..local_end);
            }
        }
    }

    let matches = score_matches(
        file_content,
        search_length,
        threshold,
        line_range.clone(),
        &scorer,
    );
    if let Some(m) = matches.first() {
        return Some(m.start_line..m.end_line);
    }
    None
}

pub fn parse_line_numbers(search: &str) -> (Option<Range<usize>>, String) {
    let parsed: Vec<_> = search.lines().map(parse_line_number).collect();
    if parsed.is_empty() {
        (Some(0..0), search.to_string())
    } else {
        let starting_index = parsed.first().expect("We checked there is a line").0;
        let ending_index = parsed.last().expect("We checked there is a line").0;
        match (starting_index, ending_index) {
            (Some(start), Some(end)) => (
                Some(start..end + 1),
                parsed
                    .iter()
                    .map(|(_, line)| *line)
                    .collect::<Vec<_>>()
                    .join("\n"),
            ),
            _ => (None, search.to_string()),
        }
    }
}

fn parse_line_number(search: &str) -> (Option<usize>, &str) {
    if let Some((line_number, line)) = LINE_NUMBER_PARSE
        .captures(search)
        .and_then(|m| try_tuple2(m.get(1), m.get(2)))
        .and_then(|(a, b)| Some((a.as_str().parse::<usize>().ok()?, b.as_str())))
    {
        (Some(line_number), line)
    } else {
        (None, search)
    }
}

struct JaroWinklerScorer {
    search_text: String,
}

impl JaroWinklerScorer {
    fn new(search_text: &str) -> Self {
        let search_text = lines(search_text)
            .map(str::trim_start)
            .collect_vec()
            .join("\n");
        Self { search_text }
    }
}

impl Scorer for JaroWinklerScorer {
    fn score(&self, target_lines: &[&str]) -> f64 {
        let target_text = target_lines
            .iter()
            .map(|line| line.trim_start())
            .collect_vec()
            .join("\n");
        jaro_winkler(&self.search_text, &target_text)
    }
}

impl fmt::Display for JaroWinklerScorer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{MakeJaroWinklerMatch}")
    }
}

#[derive(Clone)]
struct MakeJaroWinklerMatch;

impl fmt::Display for MakeJaroWinklerMatch {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Jaro-Winkler")
    }
}

impl MakeScorer for MakeJaroWinklerMatch {
    type ScorerInstance<'a> = JaroWinklerScorer;

    fn for_search<'a>(&self, search_text: &'a str) -> Self::ScorerInstance<'a> {
        JaroWinklerScorer::new(search_text)
    }
}

fn try_tuple2<A, B>(a: Option<A>, b: Option<B>) -> Option<(A, B)> {
    match (a, b) {
        (Some(a), Some(b)) => Some((a, b)),
        _ => None,
    }
}

fn find_v4a_match(edit: &V4AHunk, file_lines: &[&str]) -> Option<Range<usize>> {
    let pre_context_lines: Vec<&str> = edit.pre_context.lines().collect();
    let old_lines: Vec<&str> = edit.old.lines().collect();
    let post_context_lines: Vec<&str> = edit.post_context.lines().collect();

    let search_start = if !edit.change_context.is_empty() {
        find_change_context_start(&edit.change_context, file_lines)?
    } else {
        0
    };

    let search_lines = &file_lines[search_start..];

    let pattern_length = pre_context_lines.len() + old_lines.len() + post_context_lines.len();
    if pattern_length == 0 {
        return Some((search_start + 1)..(search_start + 1));
    }
    if pattern_length > search_lines.len() {
        return None;
    }

    let combined_search = [
        pre_context_lines.as_slice(),
        old_lines.as_slice(),
        post_context_lines.as_slice(),
    ]
    .concat()
    .join("\n");

    if let Some(range) = match_diff(&combined_search, None, search_lines, 1.0, MakeExactMatch) {
        return calculate_old_range(search_start, range, &pre_context_lines, &old_lines);
    }

    if let Some(range) = match_diff(
        &combined_search,
        None,
        search_lines,
        1.0,
        MakeIndentationAgnosticMatch,
    ) {
        return calculate_old_range(search_start, range, &pre_context_lines, &old_lines);
    }

    if let Some(range) = match_diff(
        &combined_search,
        None,
        search_lines,
        SECTION_MATCH_THRESHOLD,
        MakeJaroWinklerMatch,
    ) {
        return calculate_old_range(search_start, range, &pre_context_lines, &old_lines);
    }

    None
}

fn calculate_old_range(
    search_start: usize,
    matched_range: Range<usize>,
    pre_context_lines: &[&str],
    old_lines: &[&str],
) -> Option<Range<usize>> {
    let old_start = search_start + matched_range.start - 1 + pre_context_lines.len();
    let old_end = old_start + old_lines.len();
    Some((old_start + 1)..(old_end + 1))
}

fn find_change_context_start(change_context: &[String], file_lines: &[&str]) -> Option<usize> {
    let mut current_pos = 0;
    for marker in change_context {
        if marker.is_empty() {
            continue;
        }

        let relative_match = file_lines[current_pos..]
            .iter()
            .position(|line| line.trim_start().starts_with(marker.trim()))?;
        current_pos = current_pos + relative_match + 1;
    }
    Some(current_pos)
}
