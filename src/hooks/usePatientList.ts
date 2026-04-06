import { useState, useEffect } from 'react';
import { patientService, PatientSearchResult } from '../services/patientService';

interface PatientListFilters {
    searchQuery: string;
    gender: string;
    age: string;
    tag: string;
    marketing: string;
}

function parseAgeRange(age: string): { minAge?: number; maxAge?: number } {
    if (age === "전체") return {};
    if (age === "10대") return { minAge: 10, maxAge: 19 };
    if (age === "20대") return { minAge: 20, maxAge: 29 };
    if (age === "30대") return { minAge: 30, maxAge: 39 };
    if (age === "40대") return { minAge: 40, maxAge: 49 };
    if (age === "50대") return { minAge: 50, maxAge: 59 };
    if (age === "60대 이상") return { minAge: 60 };
    return {};
}

export function usePatientList(filters: PatientListFilters) {
    const [patients, setPatients] = useState<PatientSearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setIsLoading(true);
            try {
                const { minAge, maxAge } = parseAgeRange(filters.age);
                const marketingAgreed = filters.marketing === "전체" ? undefined : filters.marketing === "동의";

                const results = await patientService.searchPatients(filters.searchQuery || "", {
                    gender: filters.gender,
                    minAge,
                    maxAge,
                    tag: filters.tag,
                    marketingAgreed,
                });
                if (active) setPatients(results);
            } catch (error) {
                console.error("Failed to load patients:", error);
                if (active) setPatients([]);
            } finally {
                if (active) setIsLoading(false);
            }
        };

        const timer = setTimeout(load, 300);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [filters.searchQuery, filters.gender, filters.age, filters.tag, filters.marketing]);

    return { patients, isLoading };
}
