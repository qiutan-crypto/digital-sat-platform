document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('results-body');
    const refreshBtn = document.getElementById('refresh-btn');

    if (!window.supabaseClient) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error: Supabase client not initialized. Check your config.</td></tr>';
        return;
    }

    async function fetchResults() {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Loading results...</td></tr>';
        
        try {
            const { data, error } = await window.supabaseClient
                .from('student_results')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No student results found yet. Make sure to run the SQL setup script in Supabase!</td></tr>';
                return;
            }

            // Filter out duplicate submissions at the exact same time/score/test_id (e.g. from student name migrations)
            const filteredData = [];
            data.forEach(row => {
                const isDuplicate = filteredData.some(existing => {
                    const sameTest = (existing.test_id === row.test_id);
                    const sameScore = (existing.total_score === row.total_score);
                    const timeDiff = Math.abs(new Date(existing.created_at) - new Date(row.created_at));
                    return sameTest && sameScore && (timeDiff < 5000); // within 5 seconds
                });
                
                if (isDuplicate) {
                    // Prefer keeping the record with the name "Xiaosheng Liu"
                    if (row.student_name === 'Xiaosheng Liu') {
                        const index = filteredData.findIndex(existing => {
                            const sameTest = (existing.test_id === row.test_id);
                            const sameScore = (existing.total_score === row.total_score);
                            const timeDiff = Math.abs(new Date(existing.created_at) - new Date(row.created_at));
                            return sameTest && sameScore && (timeDiff < 5000);
                        });
                        if (index !== -1) {
                            filteredData[index] = row;
                        }
                    }
                } else {
                    filteredData.push(row);
                }
            });

            tbody.innerHTML = '';
            
            filteredData.forEach(row => {
                const tr = document.createElement('tr');
                
                // Format date nicely
                const dateObj = new Date(row.created_at);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                // Format test ID nicely (e.g. test4 -> Test 4)
                let formattedTestId = row.test_id;
                if (formattedTestId.startsWith('test')) {
                    formattedTestId = 'Test ' + formattedTestId.replace('test', '');
                }

                tr.innerHTML = `
                    <td>${dateStr}</td>
                    <td style="font-weight: 600;">${row.student_name}</td>
                    <td>${formattedTestId}</td>
                    <td class="total-score">${row.total_score}</td>
                    <td><span class="score-badge">${row.rw_score}</span></td>
                    <td><span class="score-badge">${row.math_score}</span></td>
                `;
                tbody.appendChild(tr);
            });
            
        } catch (error) {
            console.error('Error fetching results:', error);
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color: var(--error);">Error fetching data: ${error.message}<br>Did you run the supabase_setup.sql script in Supabase?</td></tr>`;
        }
    }

    refreshBtn.addEventListener('click', fetchResults);

    // Initial fetch
    fetchResults();
});
