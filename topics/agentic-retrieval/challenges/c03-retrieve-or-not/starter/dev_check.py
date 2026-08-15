"""Run the three sample scenarios and print what the loop did.

    python3 dev_check.py

This is a development harness, not the scored set. It prints rather than asserts, so
you can watch the decisions your loop makes and compare them against what the corpus
says should happen. The expected answer for each sample scenario is in the corpus file.
"""

import agent_loop
import fixtures


def main():
    passages, queries, scenarios = fixtures.load_corpus()

    for scenario in scenarios:
        retrieve, log = fixtures.make_retrieve(scenario, passages, queries)
        generate = fixtures.make_generate(scenario)
        print(f"\n{scenario['id']}: {scenario['query']}")
        print(f"  note: {scenario['note']}")
        try:
            result = agent_loop.run_loop(
                scenario["query"], retrieve, generate, scenario["max_steps"]
            )
        except NotImplementedError as exc:
            print(f"  not written yet: {exc}")
            continue
        print(f"  answer:   {result['answer']!r}   (expected {scenario['expected_answer']!r})")
        print(f"  steps:    {result['steps']}")
        print(f"  fetched:  {result['retrievals']}   queries actually sent: {log}")
        for decision in result["decisions"]:
            verb = "retrieved" if decision["retrieved"] else "refused  "
            print(f"    step {decision['step']}: {verb} {decision['query']!r}")
        print(f"  context:  {[p['id'] for p in result['passages']]}")


main()
