"""Train and expose the demo student-performance machine-learning model.

Important: this module uses synthetic demonstration data. It is suitable for
showing an end-to-end AIML prototype, not for making real academic decisions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

FEATURE_NAMES = [
    "study_hours",
    "attendance",
    "previous_score",
    "assignments_completed",
]


@dataclass
class TrainedModel:
    estimator: RandomForestRegressor
    mae: float
    r2: float
    training_records: int


def _make_demo_dataset(records: int = 1600, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    """Create repeatable synthetic data with plausible relationships."""
    rng = np.random.default_rng(seed)
    study_hours = rng.uniform(0, 8, records)
    attendance = rng.uniform(40, 100, records)
    previous_score = rng.uniform(25, 100, records)
    assignments_completed = rng.uniform(0, 10, records)

    # The target is deliberately synthetic and is only used to demonstrate ML.
    noise = rng.normal(0, 5.5, records)
    scores = (
        13
        + 4.0 * study_hours
        + 0.25 * attendance
        + 0.27 * previous_score
        + 1.15 * assignments_completed
        + 2.2 * np.sqrt(study_hours)
        + noise
    )
    scores = np.clip(scores, 0, 100)

    features = np.column_stack(
        [study_hours, attendance, previous_score, assignments_completed]
    )
    return features, scores


def train_model() -> TrainedModel:
    features, targets = _make_demo_dataset()
    x_train, x_test, y_train, y_test = train_test_split(
        features, targets, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=140,
        max_depth=10,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    return TrainedModel(
        estimator=model,
        mae=float(mean_absolute_error(y_test, predictions)),
        r2=float(r2_score(y_test, predictions)),
        training_records=len(features),
    )


TRAINED = train_model()


def predict_student(
    study_hours: float,
    attendance: float,
    previous_score: float,
    assignments_completed: float,
) -> dict[str, Any]:
    values = np.array(
        [[study_hours, attendance, previous_score, assignments_completed]],
        dtype=float,
    )
    predicted_score = float(TRAINED.estimator.predict(values)[0])
    predicted_score = round(float(np.clip(predicted_score, 0, 100)), 1)

    if predicted_score >= 80:
        band, risk = "Excellent", "Low"
    elif predicted_score >= 65:
        band, risk = "Good", "Low"
    elif predicted_score >= 50:
        band, risk = "Needs Attention", "Medium"
    else:
        band, risk = "Needs Support", "High"

    recommendations: list[str] = []
    if attendance < 75:
        recommendations.append("Improve attendance and try to attend at least 75% of classes.")
    if study_hours < 2:
        recommendations.append("Build a regular study routine, starting with 1–2 focused hours daily.")
    if previous_score < 50:
        recommendations.append("Revise foundational topics and ask a teacher to clarify difficult concepts.")
    if assignments_completed < 7:
        recommendations.append("Complete pending assignments and use them to practise each topic.")
    if not recommendations:
        recommendations.append("Maintain the current study routine and continue practising consistently.")

    importances = TRAINED.estimator.feature_importances_
    overall_factors = [
        {"name": name.replace("_", " ").title(), "importance": round(float(value) * 100, 1)}
        for name, value in sorted(
            zip(FEATURE_NAMES, importances), key=lambda item: item[1], reverse=True
        )
    ]

    return {
        "predicted_score": predicted_score,
        "performance_band": band,
        "risk_level": risk,
        "recommendations": recommendations,
        "overall_factors": overall_factors,
        "disclaimer": "This is an educational prototype trained on synthetic demo data. The estimate is not an official grade or a validated assessment.",
    }


def get_model_summary() -> dict[str, Any]:
    return {
        "algorithm": "Random Forest Regressor",
        "training_records": TRAINED.training_records,
        "mae": round(TRAINED.mae, 2),
        "r2_score": round(TRAINED.r2, 3),
        "data_type": "Synthetic demonstration data",
    }
