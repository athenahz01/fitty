# Fit Finder relevance evaluation

Model: Xenova/all-MiniLM-L6-v2. Queries: 11. Top-K: 5.

Baseline = semantic similarity over the old thin document.
New = program-fit hybrid (keyword + semantic) over the enriched document.

## Aggregate

| Metric | Baseline | New |
| --- | --- | --- |
| Precision@5 | 0.400 | 0.673 |
| Hit-rate@5 | 1.000 | 1.000 |
| Mean rank of expected (lower is better) | 8.88 | 4.11 |

## Per query (new ranking)

| Query | P@5 base | P@5 new | Hit new | Top 5 (new) |
| --- | --- | --- | --- | --- |
| public_policy | 0.40 | 1.00 | yes | Georgetown University; American University; George Washington University; Indiana University Bloomington; University of California-Berkeley |
| computer_science | 0.60 | 0.80 | yes | Carnegie Mellon University; University of Illinois Urbana-Champaign; Massachusetts Institute of Technology; Purdue University; University of Michigan-Ann Arbor |
| engineering | 0.40 | 0.80 | yes | Massachusetts Institute of Technology; Purdue University; University of Illinois Urbana-Champaign; University of Michigan-Ann Arbor; University of Pennsylvania |
| nursing | 0.40 | 0.80 | yes | University of Pennsylvania; Villanova University; University of Pittsburgh; Florida Agricultural and Mechanical University; Johns Hopkins University |
| business_finance | 0.40 | 0.60 | yes | Georgetown University; New York University; University of Illinois Urbana-Champaign; University of Michigan-Ann Arbor; University of Pennsylvania |
| liberal_arts | 0.80 | 0.80 | yes | Williams College; Rhode Island School of Design; Amherst College; Swarthmore College; Middlebury College |
| environmental | 0.20 | 0.60 | yes | University of California-Santa Barbara; University of California-Berkeley; Middlebury College; University of Pennsylvania; University of Illinois Urbana-Champaign |
| journalism | 0.20 | 0.60 | yes | American University; Indiana University Bloomington; Northwestern University; University of Missouri; Syracuse University |
| fine_arts | 0.40 | 0.60 | yes | Savannah College of Art and Design; Rhode Island School of Design; Carnegie Mellon University; Williams College; New York University |
| biology_premed | 0.40 | 0.60 | yes | University of Pennsylvania; University of Pittsburgh; Johns Hopkins University; University of California-Santa Barbara; University of Chicago |
| economics | 0.20 | 0.20 | yes | Georgetown University; New York University; University of California-Santa Barbara; Amherst College; University of Pennsylvania |

## Quality bar

- Precision@5 >= 0.55: PASS (0.673)
- Hit-rate@5 >= 1: PASS (1.000)
- Beats baseline precision: PASS (0.673 vs 0.400)

Result: PASS
