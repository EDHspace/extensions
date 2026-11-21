import type { ExtensionCard } from "./contracts";

export function drawProbability(model: {
    population: number;
    successes: number;
    draws: number;
    atLeast: number;
}) {
    const { population, successes, draws, atLeast } = model;
    if (
        ![population, successes, draws, atLeast].every(Number.isInteger) ||
        population < 1 ||
        population > 1000 ||
        successes < 0 ||
        successes > population ||
        draws < 0 ||
        draws > population ||
        atLeast < 0 ||
        atLeast > draws
    )
        throw new RangeError(
            "Use whole numbers: library 1-1000, targets and draws within the library, and minimum within the draw."
        );
    return hypergeometricAtLeast(population, successes, draws, atLeast);
}
export function manaCurve(cards: readonly ExtensionCard[]) {
    const bins = new Map<string, number>();
    for (const card of cards) {
        if (card.commander || /\bLand\b/.test(card.typeLine?.split(/\s*\/\/\s*/)[0] ?? ""))
            continue;
        const bin =
            card.manaValue === undefined
                ? "Unknown"
                : card.manaValue >= 7
                  ? "7+"
                  : String(card.manaValue);
        bins.set(bin, (bins.get(bin) ?? 0) + card.quantity);
    }
    return [...bins]
        .sort(
            ([a], [b]) =>
                (a === "Unknown" ? Infinity : parseFloat(a)) -
                (b === "Unknown" ? Infinity : parseFloat(b))
        )
        .map(([manaValue, count]) => ({ manaValue, count }));
}

/**
 * Calculate binomial coefficient: n choose k
 * C(n,k) = n! / (k! * (n-k)!)
 */
function binomialCoefficient(n: number, k: number): number {
    if (k > n || k < 0) return 0;
    if (k === 0 || k === n) return 1;
    // Optimize by using the smaller of k or n-k
    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 0; i < k; i++) {
        result *= n - i;
        result /= i + 1;
    }
    return result;
}

/**
 * Calculate hypergeometric probability
 *
 * @param populationSize - Total number of cards in deck (N)
 * @param successesInPopulation - Number of success cards in deck (K) - e.g., number of lands
 * @param sampleSize - Number of cards drawn (n) - e.g., opening hand of 7
 * @param successesInSample - Exact number of successes you want (k) - e.g., exactly 3 lands
 * @returns Probability of drawing exactly k successes
 */
export function hypergeometric(
    populationSize: number,
    successesInPopulation: number,
    sampleSize: number,
    successesInSample: number
): number {
    // C(K, k) * C(N-K, n-k) / C(N, n)
    const numerator =
        binomialCoefficient(successesInPopulation, successesInSample) *
        binomialCoefficient(populationSize - successesInPopulation, sampleSize - successesInSample);
    const denominator = binomialCoefficient(populationSize, sampleSize);
    return numerator / denominator;
}

/**
 * Calculate probability of drawing AT LEAST k successes
 *
 * @param populationSize - Total number of cards in deck (N)
 * @param successesInPopulation - Number of success cards in deck (K)
 * @param sampleSize - Number of cards drawn (n)
 * @param minSuccesses - Minimum number of successes you want (k or more)
 * @returns Probability of drawing at least k successes
 */
export function hypergeometricAtLeast(
    populationSize: number,
    successesInPopulation: number,
    sampleSize: number,
    minSuccesses: number
): number {
    let probability = 0;
    for (let k = minSuccesses; k <= Math.min(sampleSize, successesInPopulation); k++) {
        probability += hypergeometric(populationSize, successesInPopulation, sampleSize, k);
    }
    return probability;
}

/**
 * Calculate probability of drawing AT MOST k successes
 *
 * @param populationSize - Total number of cards in deck (N)
 * @param successesInPopulation - Number of success cards in deck (K)
 * @param sampleSize - Number of cards drawn (n)
 * @param maxSuccesses - Maximum number of successes you want (k or fewer)
 * @returns Probability of drawing at most k successes
 */
export function hypergeometricAtMost(
    populationSize: number,
    successesInPopulation: number,
    sampleSize: number,
    maxSuccesses: number
): number {
    let probability = 0;
    for (let k = 0; k <= Math.min(maxSuccesses, sampleSize, successesInPopulation); k++) {
        probability += hypergeometric(populationSize, successesInPopulation, sampleSize, k);
    }
    return probability;
}

/**
 * Calculate probability of drawing BETWEEN k1 and k2 successes (inclusive)
 */
export function hypergeometricBetween(
    populationSize: number,
    successesInPopulation: number,
    sampleSize: number,
    minSuccesses: number,
    maxSuccesses: number
): number {
    let probability = 0;
    for (
        let k = minSuccesses;
        k <= Math.min(maxSuccesses, sampleSize, successesInPopulation);
        k++
    ) {
        probability += hypergeometric(populationSize, successesInPopulation, sampleSize, k);
    }
    return probability;
}

/**
 * Card group for multivariate hypergeometric calculation
 */
export interface CardGroup {
    count: number; // Number of this type of card in deck
    min?: number; // Minimum number needed (default: 1)
    max?: number; // Maximum number wanted (default: sample size)
}

/**
 * Calculate probability of drawing specific amounts from multiple card groups
 * Uses multivariate hypergeometric distribution
 *
 * Example: "What's the probability of drawing at least 1 Sanguine Bond effect (3 in deck)
 * AND at least 1 Exquisite Blood effect (2 in deck) in 15 cards?"
 *
 * @param populationSize - Total number of cards in deck (N)
 * @param groups - Array of card groups with their counts and constraints
 * @param sampleSize - Number of cards drawn (n)
 * @returns Probability of meeting all group constraints simultaneously
 */
export function multivariateHypergeometric(
    populationSize: number,
    groups: CardGroup[],
    sampleSize: number
): number {
    // Validate inputs
    const totalGroupCards = groups.reduce((sum, g) => sum + g.count, 0);
    if (totalGroupCards > populationSize) {
        throw new Error("Total group cards exceeds population size");
    }
    // Calculate number of "other" cards (cards not in any group)
    const otherCards = populationSize - totalGroupCards;
    let probability = 0;
    // Generate all possible combinations that satisfy the constraints
    function generateCombinations(
        groupIndex: number,
        currentCounts: number[],
        remainingDraw: number
    ): void {
        // Base case: we've assigned counts for all groups
        if (groupIndex === groups.length) {
            // Check if we have a valid combination (constraints met)
            let valid = true;
            for (let i = 0; i < groups.length; i++) {
                const min = groups[i].min ?? 1;
                const max = groups[i].max ?? sampleSize;
                if (currentCounts[i] < min || currentCounts[i] > max) {
                    valid = false;
                    break;
                }
            }
            if (!valid) return;
            // Calculate probability for this specific combination
            // P = (C(K1,k1) * C(K2,k2) * ... * C(other, n-k1-k2-...)) / C(N, n)
            let numerator = 1;
            // Multiply binomial coefficients for each group
            for (let i = 0; i < groups.length; i++) {
                numerator *= binomialCoefficient(groups[i].count, currentCounts[i]);
            }
            // Multiply by binomial coefficient for "other" cards
            const otherDrawn = remainingDraw;
            numerator *= binomialCoefficient(otherCards, otherDrawn);
            const denominator = binomialCoefficient(populationSize, sampleSize);
            probability += numerator / denominator;
            return;
        }
        // Recursive case: try all possible counts for current group
        const group = groups[groupIndex];
        const minDraw = Math.max(0, group.min ?? 0);
        const maxDraw = Math.min(group.count, remainingDraw, group.max ?? sampleSize);
        for (let count = minDraw; count <= maxDraw; count++) {
            currentCounts[groupIndex] = count;
            generateCombinations(groupIndex + 1, currentCounts, remainingDraw - count);
        }
    }
    generateCombinations(0, [], sampleSize);
    return probability;
}
