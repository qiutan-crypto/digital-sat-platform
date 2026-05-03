class ScoringManager {
    static calculateScore(answers, testData) {
        let rwRaw = 0;
        let mathRaw = 0;
        let rwTotal = 0;
        let mathTotal = 0;

        // Calculate raw scores and totals
        for (const module of testData.modules) {
            const isMath = module.name.toLowerCase().includes('math');
            const totalQs = module.questions.length;
            
            if (isMath) mathTotal += totalQs;
            else rwTotal += totalQs;

            for (const q of module.questions) {
                if (answers[q.id] === q.correctAnswer) {
                    if (isMath) mathRaw++;
                    else rwRaw++;
                }
            }
        }

        const rwFinal = rwTotal > 0 ? Math.round(200 + 600 * (rwRaw / rwTotal)) : 200;
        const mathFinal = mathTotal > 0 ? Math.round(200 + 600 * (mathRaw / mathTotal)) : 200;

        // Round to nearest 10 like standard SAT
        const rwRounded = Math.round(rwFinal / 10) * 10;
        const mathRounded = Math.round(mathFinal / 10) * 10;

        return {
            total: rwRounded + mathRounded,
            rw: rwRounded,
            math: mathRounded,
            raw: { rw: rwRaw, math: mathRaw }
        };
    }
}
