/**
 * examConfig.js
 *
 * প্রশ্ন সংখ্যার উপর ভিত্তি করে পরীক্ষার সমস্ত settings auto-calculate করে।
 * 100 MCQ → 60 min, pass 60  (backward compatible)
 * 50  MCQ → 30 min, pass 30
 * অন্য যেকোনো সংখ্যা → proportional
 */

export function getExamConfig(totalQuestions) {
    if (totalQuestions === 100) {
        return {
            durationSeconds: 60 * 60,       // ৬০ মিনিট
            markPerQuestion: 1.0,
            negativeMarking: 0.25,
            passMark: 60.0,
            storageKey: 'mcq_state_v100',   // পুরনো key — backward compatible
            displayText: 'সময়: ৬০ মিনিট | মোট নম্বর: ১০০.০ | প্রশ্ন: ১০০',
            markingText: 'সঠিক: +১ | ভুল: -০.২৫ | পাস মার্ক: ৬০.০',
            title: 'GST 100MCQ',
        }
    }

    if (totalQuestions === 50) {
        return {
            durationSeconds: 30 * 60,       // ৩০ মিনিট
            markPerQuestion: 1.0,
            negativeMarking: 0.25,
            passMark: 30.0,
            storageKey: 'mcq_state_v50',
            displayText: 'সময়: ৩০ মিনিট | মোট নম্বর: ৫০.০ | প্রশ্ন: ৫০',
            markingText: 'সঠিক: +১ | ভুল: -০.২৫ | পাস মার্ক: ৩০.০',
            title: 'GST 50MCQ',
        }
    }

    // যেকোনো অন্য সংখ্যার জন্য auto-calculate (proportional)
    const passMark = parseFloat((totalQuestions * 0.60).toFixed(1))
    const durationMins = Math.round(totalQuestions * 0.6)
    return {
        durationSeconds: durationMins * 60,
        markPerQuestion: 1.0,
        negativeMarking: 0.25,
        passMark,
        storageKey: `mcq_state_v${totalQuestions}`,
        displayText: `সময়: ${durationMins} মিনিট | মোট নম্বর: ${totalQuestions}.০ | প্রশ্ন: ${totalQuestions}`,
        markingText: `সঠিক: +১ | ভুল: -০.২৫ | পাস মার্ক: ${passMark}`,
        title: `GST ${totalQuestions}MCQ`,
    }
}
